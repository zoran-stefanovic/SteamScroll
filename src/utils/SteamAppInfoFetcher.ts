import { execFile } from 'child_process'; // Correct import for execFile
import { fileURLToPath } from 'url';
import path from 'path';

export class SteamAppInfoFetcher {
  private exePath: string;

  constructor() {
    // Determine the path to the appinfo parser executable
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    this.exePath = path.resolve(__dirname, '../bin', 'appinfoparser.exe');
  }

  /**
   * Fetches app info by executing the appinfo parser.
   * @param filePath Path to the appinfo.vdf file.
   * @returns A promise that resolves to an array of objects containing appId, type, and iconPath.
   */
  public fetchAppInfo(filePath: string): Promise<{ appId: number; type: string; iconPath: string | null }[]> {
    return new Promise((resolve, reject) => {
      execFile(this.exePath, [filePath], (error: Error | null, stdout: string, stderr: string) => {
        if (error) {
          console.error('Error executing appinfo parser:', error.message);
          reject(new Error(`Failed to execute appinfo parser: ${error.message}`));
          return;
        }

        if (stderr) {
          console.warn('Parser stderr:', stderr.trim());
        }

        try {
          // Parse the output of the parser
          const result = stdout
            .trim()
            .split('\n')
            .map((line: string) => {
              const parts = line.split(',');
              if (parts.length < 3) {
                throw new Error(`Invalid line format: ${line}`);
              }

              const [appId, type, iconPath] = parts;
              if (!appId || isNaN(parseInt(appId, 10))) {
                throw new Error(`Invalid appId in line: ${line}`);
              }

              return {
                appId: parseInt(appId, 10),
                type: type.trim(),
                iconPath: iconPath.trim() === 'NoIcon' ? null : iconPath.trim(),
              };
            });
          resolve(result);
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          console.error('Error parsing parser output:', errorMessage);
          reject(new Error(`Failed to parse appinfo parser output: ${errorMessage}`));
        }
      });
    });
  }
}
