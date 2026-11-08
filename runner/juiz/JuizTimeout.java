package juiz;

// Herda de Error para um catch (Exception e) do aluno não engolir o fim do tempo
public final class JuizTimeout extends Error {
    public JuizTimeout() {
        super("tempo limite excedido");
    }
}
