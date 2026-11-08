import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.PrintStream;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.net.URL;
import java.net.URLClassLoader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Comparator;
import java.util.stream.Stream;

/** Prepara os fontes do aluno e roda o main dele uma vez por entrada, recarregando as classes a cada teste.
 *  Uso: JuizRunner --prepare pacote pasta | JuizRunner pastaDasClasses classeMain tempoLimiteMs relatorio entrada1 [...] */
public class JuizRunner {
    static final String SEP = "\u0000JUIZ\u0000";

    static class ExitCalled extends SecurityException {
        final int status;

        ExitCalled(int status) {
            super("System.exit(" + status + ")");
            this.status = status;
        }
    }

    // Apaga as pastas de trabalho antigas, chamado só ao abrir a página, antes de qualquer javac
    static void clean(Path dir) throws Exception {
        if (Files.exists(dir)) {
            try (Stream<Path> walk = Files.walk(dir)) {
                walk.sorted(Comparator.reverseOrder()).forEach(p -> p.toFile().delete());
            }
        }
    }

    // Grava cada arquivo do pacote no caminho dele, com a lista para o javac
    static void prepare(String bundlePath, String dir) throws Exception {
        Path root = Paths.get(dir);
        String[] parts = new String(Files.readAllBytes(Paths.get(bundlePath)), StandardCharsets.UTF_8).split(SEP, -1);
        StringBuilder sources = new StringBuilder();
        for (int i = 0; i + 1 < parts.length; i += 2) {
            Path file = root.resolve("src").resolve(parts[i]);
            Files.createDirectories(file.getParent());
            Files.write(file, parts[i + 1].getBytes(StandardCharsets.UTF_8));
            sources.append('"').append(file.toString().replace("\\", "/")).append("\"\n");
        }
        Files.createDirectories(root.resolve("out"));
        Files.write(root.resolve("sources.txt"), sources.toString().getBytes(StandardCharsets.UTF_8));
    }

    public static void main(String[] args) throws Exception {
        if (args[0].equals("--prepare")) {
            prepare(args[1], args[2]);
            return;
        }
        if (args[0].equals("--clean")) {
            clean(Paths.get(args[1]));
            return;
        }
        URL classes = new File(args[0]).toURI().toURL();
        String mainClass = args[1];
        long limit = Long.parseLong(args[2]);
        PrintStream realOut = System.out;
        installExitTrap();
        reportPath = args[3];
        // Se um System.exit escapar da trava, o relatório sai mesmo assim, com o teste atual encerrado normalmente
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            if (!written) {
                appendCurrent("ok");
                writeReport();
            }
        }));
        for (int i = 4; i < args.length; i++) {
            String input = new String(Files.readAllBytes(Paths.get(args[i])), StandardCharsets.UTF_8);
            out = new ByteArrayOutputStream();
            err = new ByteArrayOutputStream();
            System.setIn(new ByteArrayInputStream(input.getBytes(StandardCharsets.UTF_8)));
            System.setOut(new PrintStream(out, true, "UTF-8"));
            System.setErr(new PrintStream(err, true, "UTF-8"));
            String status = runOne(classes, mainClass, limit);
            appendCurrent(status);
            // Só para quando a thread do aluno continua presa, porque o Guard já encerra os laços instrumentados
            if (status.equals("hung")) {
                break;
            }
        }
        writeReport();
        realOut.flush();
        Runtime.getRuntime().halt(0);
    }

    static final StringBuilder report = new StringBuilder();
    static volatile ByteArrayOutputStream out, err;
    static String reportPath;
    static volatile boolean written;

    static synchronized void appendCurrent(String status) {
        if (out == null) {
            return;
        }
        System.out.flush();
        System.err.flush();
        report.append(status).append(SEP).append(new String(out.toByteArray(), StandardCharsets.UTF_8)).append(SEP)
            .append(new String(err.toByteArray(), StandardCharsets.UTF_8)).append(SEP);
        out = null;
    }

    static synchronized void writeReport() {
        if (written) {
            return;
        }
        written = true;
        try {
            Files.write(Paths.get(reportPath), report.toString().getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    static String runOne(URL classes, String mainClass, long limit) throws Exception {
        // Carregador novo por teste, para os atributos static do aluno voltarem ao valor inicial
        URLClassLoader loader = new URLClassLoader(new URL[] {classes}, ClassLoader.getPlatformClassLoader());
        try {
            loader.loadClass("juiz.Guard").getField("deadline").setLong(null, System.currentTimeMillis() + limit);
        } catch (ClassNotFoundException e) {
            // Sem o Guard compilado, só o join abaixo limita o tempo
        }
        Method main = loader.loadClass(mainClass).getMethod("main", String[].class);
        String[] status = {"ok"};
        Thread t = new Thread(() -> {
            try {
                main.invoke(null, (Object) new String[0]);
            } catch (InvocationTargetException e) {
                Throwable cause = e.getCause();
                if (cause.getClass().getName().equals("juiz.JuizTimeout")) {
                    status[0] = "timeout";
                } else if (!(cause instanceof ExitCalled)) {
                    System.err.print("Exception in thread \"main\" ");
                    cause.printStackTrace();
                    status[0] = "exception";
                }
            } catch (Throwable e) {
                status[0] = "exception";
                e.printStackTrace();
            }
        });
        t.setDaemon(true);
        t.start();
        t.join(limit);
        loader.close();
        return t.isAlive() ? "hung" : status[0];
    }

    @SuppressWarnings("removal")
    static void installExitTrap() {
        // System.exit do aluno termina só o teste atual, e não o juiz inteiro
        try {
            System.setSecurityManager(new SecurityManager() {
                @Override
                public void checkExit(int status) {
                    throw new ExitCalled(status);
                }

                @Override
                public void checkPermission(java.security.Permission perm) {
                }
            });
        } catch (UnsupportedOperationException e) {
            // Sem SecurityManager, um System.exit encerra o juiz e os testes seguintes aparecem sem saída
        }
    }
}
