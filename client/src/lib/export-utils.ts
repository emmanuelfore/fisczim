
import { apiFetch } from "./api";
import { toast } from "@/hooks/use-toast";

export async function downloadExcel(url: string, filename: string) {
    try {
        const res = await apiFetch(url);
        if (!res.ok) {
            const error = await res.json().catch(() => ({}));
            throw new Error(error.message || "Failed to download export");
        }

        const blob = await res.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(downloadUrl);
    } catch (error: any) {
        // The API names the reason (a draft run cannot be paid, a year has no
        // locked runs); a toast shows it without stopping the user mid-click.
        toast({
            title: "Export failed",
            description: error?.message || "The export could not be generated.",
            variant: "destructive",
        });
    }
}
