using System;
using System.Diagnostics;
using System.IO;

internal static class Program
{
    private static int Main(string[] args)
    {
        try
        {
            string exeDir = AppContext.BaseDirectory;
            string ps1 = Path.Combine(exeDir, "diagnostic.ps1");
            if (!File.Exists(ps1))
            {
                Console.Error.WriteLine("Nie znaleziono diagnostic.ps1 obok diagnostic.exe: " + ps1);
                return 2;
            }

            string joinedArgs = string.Join(" ", args);
            var psi = new ProcessStartInfo
            {
                FileName = "powershell.exe",
                Arguments = "-NoProfile -ExecutionPolicy Bypass -File \"" + ps1 + "\" " + joinedArgs,
                UseShellExecute = false,
            };

            using (var p = Process.Start(psi))
            {
                p.WaitForExit();
                return p.ExitCode;
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine(ex.ToString());
            return 1;
        }
    }
}
