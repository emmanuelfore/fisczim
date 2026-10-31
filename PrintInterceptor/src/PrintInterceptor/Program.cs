using System.Windows.Forms;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Hosting.WindowsServices;
using PrintInterceptor.Core.Capture;
using PrintInterceptor.Core.Configuration;
using PrintInterceptor.Core.Decoding;
using PrintInterceptor.Core.Diagnostics;
using PrintInterceptor.Core.Fiscalisation;
using PrintInterceptor.Core.Offline;
using PrintInterceptor.Core.Pipeline;
using PrintInterceptor.Core.Printing;
using PrintInterceptor.Core.State;
using PrintInterceptor.Core.Storage;

namespace PrintInterceptor;

public static class Program
{
    [STAThread]
    public static int Main(string[] args)
    {
        var trayMode = args.Contains("--tray", StringComparer.OrdinalIgnoreCase);
        var configPath = ResolveConfigPath(args);
        var consoleMode = args.Contains("--console", StringComparer.OrdinalIgnoreCase)
                          || (!WindowsServiceHelpers.IsWindowsService() && !trayMode);

        var configExisted = File.Exists(configPath);

        InterceptorConfig config;
        try
        {
            config = InterceptorConfig.LoadOrCreate(configPath);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"Could not load configuration from {configPath}: {ex.Message}");
            return 1;
        }

        // Optional: keep the secret out of config.json on managed tills.
        var environmentApiKey = Environment.GetEnvironmentVariable("PRINTINTERCEPTOR_API_KEY");
        if (!string.IsNullOrWhiteSpace(environmentApiKey))
        {
            config.ApiKey = environmentApiKey.Trim();
        }

        var log = new FileLog(Path.Combine(config.ResolveDataDirectory(), "logs"), consoleMode || trayMode);

        if (!configExisted)
        {
            log.Warn($"Created a default configuration at {configPath}. Set apiKey and printing options, then restart.");
        }

        var validationErrors = config.Validate();
        if (validationErrors.Count > 0)
        {
            foreach (var error in validationErrors)
            {
                log.Error($"Configuration error: {error}");
            }

            if (trayMode)
            {
                MessageBox.Show(
                    string.Join(Environment.NewLine, validationErrors),
                    "PrintInterceptor configuration",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
            }

            return 1;
        }

        if (string.IsNullOrWhiteSpace(config.ApiKey))
        {
            log.Warn("apiKey is empty. Jobs will be held for review until it is configured.");
        }

        log.Info($"PrintInterceptor starting. Config={configPath} Data={config.ResolveDataDirectory()} Mode={(trayMode ? "tray" : "service/console")}");
        log.Info(
            $"Capture {config.ListenAddress}:{config.ListenPort}; API {config.ApiEndpoint}; " +
            $"printing={(config.Printing.Enabled ? config.Printing.PrinterName is { Length: > 0 } name ? name : "default printer" : "disabled")}, " +
            $"format={config.Printing.Format}, A4 printer={(string.IsNullOrWhiteSpace(config.Printing.A4PrinterName) ? "(fallback)" : config.Printing.A4PrinterName)}.");

        var builder = Host.CreateDefaultBuilder(args);

        if (!consoleMode && !trayMode)
        {
            builder.UseWindowsService(options => options.ServiceName = "PrintInterceptor");
        }

        builder.ConfigureServices(services =>
        {
            services.AddSingleton(config);
            services.AddSingleton<ILog>(log);
            services.AddSingleton(serviceProvider =>
                new JobLedger(Path.Combine(config.ResolveDataDirectory(), "state"), log));
            services.AddSingleton(serviceProvider =>
                new FiscalChainStore(Path.Combine(config.ResolveDataDirectory(), "state"), log));
            services.AddSingleton(serviceProvider =>
                new OfflineQueue(Path.Combine(config.ResolveDataDirectory(), "state"), log));
            services.AddSingleton<CompanyProfileService>();
            services.AddSingleton<OfflineReceiptService>();
            services.AddSingleton<OfflineSyncEngine>();
            services.AddSingleton<JobDecoder>();
            services.AddSingleton<FiscalStackClient>();
            services.AddSingleton<JobStore>();
            services.AddSingleton<PrintSnapshotStore>();
            services.AddSingleton<IReceiptPrinter, WindowsGdiReceiptPrinter>();
            services.AddSingleton<PrintJobPipeline>();
            services.AddSingleton<IJobProcessor>(serviceProvider =>
                serviceProvider.GetRequiredService<PrintJobPipeline>());
            services.AddSingleton<PrintJobServer>();
            services.AddHostedService<PrintInterceptorHostedService>();
            services.AddHostedService<OfflineSyncService>();
            services.AddHostedService<CompanyProfileHostedService>();
        });

        using var host = builder.Build();

        if (!trayMode)
        {
            host.Run();
            return 0;
        }

        try
        {
            host.Start();
        }
        catch (Exception ex)
        {
            log.Error("Could not start PrintInterceptor in tray mode", ex);
            MessageBox.Show(
                $"PrintInterceptor could not start.{Environment.NewLine}{Environment.NewLine}{ex.Message}",
                "PrintInterceptor",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
            return 1;
        }

        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);

        using var context = new TrayApplicationContext(host.Services, config, log);
        Application.Run(context);

        try
        {
            host.StopAsync(TimeSpan.FromSeconds(10)).GetAwaiter().GetResult();
        }
        catch (Exception ex)
        {
            log.Warn($"Stopping the host reported: {ex.Message}");
        }

        return 0;
    }

    private static string ResolveConfigPath(string[] arguments)
    {
        for (var i = 0; i < arguments.Length - 1; i++)
        {
            if (string.Equals(arguments[i], "--config", StringComparison.OrdinalIgnoreCase))
            {
                return Path.GetFullPath(arguments[i + 1]);
            }
        }

        var fromEnvironment = Environment.GetEnvironmentVariable("PRINTINTERCEPTOR_CONFIG");
        return string.IsNullOrWhiteSpace(fromEnvironment)
            ? InterceptorConfig.DefaultConfigPath()
            : Path.GetFullPath(fromEnvironment);
    }
}
