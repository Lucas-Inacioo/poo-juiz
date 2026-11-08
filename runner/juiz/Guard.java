package juiz;

/** Chamado no começo de cada repetição do código do aluno, que o site instrumenta antes de compilar.
 *  Lança JuizTimeout quando o teste passa do tempo limite, porque o CheerpJ não interrompe laços infinitos. */
public final class Guard {
    public static volatile long deadline = Long.MAX_VALUE;
    private static int calls;

    private Guard() {
    }

    public static boolean ok() {
        tick();
        return true;
    }

    public static void tick() {
        if ((++calls & 1023) == 0 && System.currentTimeMillis() > deadline) {
            throw new JuizTimeout();
        }
    }
}
