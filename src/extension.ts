// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

const checkerPath = "log/checker";


// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) { return []; }
    const workspacePath = workspaceFolders[0].uri.fsPath;

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code wll only be executed once when your extension is activated
	console.log('woo! woo! your extension "vs-flux" is now active!', workspacePath);

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand('vs-flux.helloWorld', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		const editor = vscode.window.activeTextEditor;
        if (editor) {
            const position = editor.selection.active;
            const lineNumber = position.line + 1; // VS Code is 0-based
            vscode.window.showInformationMessage(`The cursor is on line ${lineNumber}`);
        }
		// vscode.window.showInformationMessage('Hail me hearties from vs-flux!');
	});
	context.subscriptions.push(disposable);

    // Create InfoProvider
    const infoProvider = new InfoProvider(workspacePath, new Set<string>);

	// Register a custom webview panel
	const fluxViewProvider = new FluxViewProvider(context.extensionUri, infoProvider);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider('fluxView', fluxViewProvider)
	);

	// Listener to track cursor position
	context.subscriptions.push(
		vscode.window.onDidChangeTextEditorSelection((event) => {
			if (event.textEditor) {
				const position = event.textEditor.selection.active;
                const fileName = event.textEditor.document.fileName;
				infoProvider.updatePosition(fileName, position.line + 1, position.character + 1);
                fluxViewProvider.updateView(infoProvider);
			}
		})
	);

    /* Watch for changes to the trace-file ***********************************************/

    // Track the set of saved (updated) source files

    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument((document) => {
            console.log('changed (0): ' + document.fileName);
            if (document.fileName.endsWith('.rs')) {
                console.log('changed (2): ' + document.fileName);
                infoProvider.addChangedFile(document.fileName);
            }
        }
    ));

    // Reload the flux trace information for changedFiles
    const logFilePattern = new vscode.RelativePattern(workspacePath, checkerPath);
    const fileWatcher = vscode.workspace.createFileSystemWatcher(logFilePattern);

    fileWatcher.onDidChange((uri) => {
        console.log(`Log file changed: ${uri.fsPath}`);
        updateFluxCheckerTrace(context, infoProvider).then(() => {
            fluxViewProvider.updateView(infoProvider);
        });
    });

    /******************************************************************************/

}

// This method is called when your extension is deactivated
export function deactivate() {}

type LineMap = Map<number, LineInfo>;

class InfoProvider {

    constructor(private readonly _workspacePath : string, private readonly _changedFiles: Set<string>) {}

    private _fileMap: Map<string, LineMap> = new Map();

    currentFile: string = "";
    currentLine: number = 0;
    currentColumn: number = 0;

    private relFile(file: string) : string {
        return path.relative(this._workspacePath, file);
    }

    public updatePosition(file: string, line: number, column: number) {
        this.currentFile = this.relFile(file);
        this.currentLine = line;
        this.currentColumn = column;
    }

    public addChangedFile(file: string) {
        this._changedFiles.add(this.relFile(file));
    }

    public getChangedFiles() : Set<string> {
        const res = new Set([...this._changedFiles]);
        res.add(this.currentFile);
        return res
    }

    public updateInfo(fileName: string, fileInfo: LineInfo[]) {
        const lineMap = new Map(fileInfo.map(item => [item.line, item]));
        this._fileMap.set(fileName, lineMap);
        this._changedFiles.delete(fileName);
    }

    public getLineInfo(file:string, line: number) : LineInfo | undefined {
        const res = this._fileMap.get(file)?.get(line);
        console.log('getLineInfo', file, line, res);
        return res;
    }

}

class FluxViewProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;
    private _currentLine: number = 0;
    // private _currentColumn: number = 0;
    // private _currentFileName: string = "";
    private _currentRcx : string = "...";
    private _currentEnv : string = "...";
    private _fontFamily: string | undefined = 'Arial';
    private _fontSize: number | undefined = 14;

    constructor(private readonly _extensionUri: vscode.Uri, private readonly _infoProvider: InfoProvider) {}

    public updateView(infoProvider: InfoProvider) {
        const file = infoProvider.currentFile;
        const line = infoProvider.currentLine;
        console.log('updateView', file, line);
        const info = this._infoProvider.getLineInfo(file, line);
        this._currentLine = line;
        this._currentRcx = info ? info.rcx : "...";
        this._currentEnv = info ? info.env : "...";
        if (this._view) {
            this._view.webview.html = this._getHtmlForWebview();
        }
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        const config = vscode.workspace.getConfiguration('editor');
        this._fontFamily = config.get<string>('fontFamily');
        this._fontSize = config.get<number>('fontSize');

        webviewView.webview.html = this._getHtmlForWebview();
    }

    private _getHtmlForWebview() {
        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Flux</title>
                <style>
                    body {
                        display: flex;
                        align-items: left;
                        height: 100%;
                        margin: 0;
                        font-family: ${this._fontFamily};
                        background-color: var(--vscode-editor-background);
                    }
                    #cursor-position {
                        font-size: ${this._fontSize};
                    }
                </style>
            </head>
            <body>
                <div id="cursor-position">
                    <table style="border-collapse: collapse">
                    <tr>
                      <th style="padding: 8px; border: 1px solid black">Line</th>
                      <td style="padding: 8px; border: 1px solid black">${this._currentLine}</td>
                    </tr>
                    <tr style="color: green">
                      <th style="padding: 8px; border: 1px solid black">RCX</th>
                      <td style="padding: 8px; border: 1px solid black">${this._currentRcx}</td>
                    </tr>
                    <tr style="color: blue">
                      <th style="padding: 8px; border: 1px solid black">ENV</th>
                      <td style="padding: 8px; border: 1px solid black">${this._currentEnv}</td>
                    </tr>
                    </table>
                </div>
            </body>
            </html>
        `;
    }
}

async function updateFluxCheckerTrace(context: vscode.ExtensionContext, infoProvider: InfoProvider) {
    try {
        const files = infoProvider.getChangedFiles();
        const lineInfos = await readFluxCheckerTrace(files);
        lineInfos.forEach((lineInfo, fileName) => {
            console.log('updating info for: ', fileName, lineInfo);
            infoProvider.updateInfo(fileName, lineInfo);
        });
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to load line info: ${error}`);
    }
}

async function readFluxCheckerTrace(changedFiles: Set<string>): Promise<Map<string, LineInfo[]>> {
    try {
        // Get the workspace folder
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) { return new Map(); }

        // Read the file using VS Code's file system API
        const workspacePath = workspaceFolders[0].uri.fsPath;
        const logPath = path.join(workspacePath, "log/checker");
        const logUri = vscode.Uri.file(logPath);
        const logData = await vscode.workspace.fs.readFile(logUri);
        const logString = Buffer.from(logData).toString('utf8');

        console.log('parsed logString size = ', logString.length, ' changed files = ', changedFiles);
        // Parse the logString
        const data = parseEventLog(changedFiles, logString);
        return data;
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to read line info: ${error}`);
        return new Map();
    }
}

type StmtSpan = {
    file: string;
    start_line: number;
    start_col: number;
    end_line: number;
    end_col: number;
}

type LineInfo = {
    line: number;
    rcx: string;
    env: string;
}

function parseStatementSpan(span: string): StmtSpan | undefined {
    if (span) {
        const parts = span.split(':');
        if (parts.length === 5) {
            const end_col_str = parts[4].split(' ')[0];
            const end_col = parseInt(end_col_str, 10);
            return {
                file: parts[0],
                start_line: parseInt(parts[1], 10),
                start_col: parseInt(parts[2], 10),
                end_line: parseInt(parts[1], 10),
                end_col: end_col, // parseInt(parts[3], 10),
            };
        }
    }
    return undefined;
}

function parseEvent(files: Set<string>, event: any): [string, LineInfo] | undefined {
    if (event.fields.event === 'statement_end') {
        const stmt_span = parseStatementSpan(event.fields.stmt_span);
        if (stmt_span && files.has(stmt_span.file)) {
            const info = {line: stmt_span.end_line, rcx: event.fields.rcx, env: event.fields.env};
            return [stmt_span.file, info];
        }
    }
    return undefined;
}

function parseEventLog(files: Set<string>, logString: string): Map<string, LineInfo[]> {
    const events = logString.split('\n').filter(line => line.trim()).map(line => JSON.parse(line));
    const res = new Map();
    events.forEach(event => {
        const eventInfo = parseEvent(files, event);
        if (eventInfo) {
            const [fileName, info] = eventInfo;
            if (!res.has(fileName)) {
                res.set(fileName, []);
            }
            res.get(fileName)?.push(info);
        }
    });
    return res;
}