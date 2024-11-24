// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('woo! woo! your extension "vs-flux" is now active!');

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
    const infoProvider = new InfoProvider();

	// Register a custom webview panel
	const cursorViewProvider = new FluxViewProvider(context.extensionUri, infoProvider);

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider('fluxView', cursorViewProvider)
	);

	// Listener to track cursor position
	context.subscriptions.push(
		vscode.window.onDidChangeTextEditorSelection((event) => {
			if (event.textEditor) {
				const position = event.textEditor.selection.active;
                const fileName = event.textEditor.document.fileName;
				cursorViewProvider.updateFluxView(fileName, position.line + 1, position.character + 1);
			}
		})
	);

    /* Load the LineInfo File ******************************************************/

    // Check initial active editor
    if (vscode.window.activeTextEditor) {
        checkAndLoadFile(vscode.window.activeTextEditor.document, context, infoProvider);
    }

   // Watch for active editor changes
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor) {
                checkAndLoadFile(editor.document, context, infoProvider);
            }
        })
    );

    // // Watch for document changes
    // context.subscriptions.push(
    //     vscode.workspace.onDidChangeTextDocument(event => {
    //         if (event.document === vscode.window.activeTextEditor?.document) {
    //             checkAndLoadFile(event.document, context);
    //         }
    //     })
    // );

    /******************************************************************************/

}

// This method is called when your extension is deactivated
export function deactivate() {}


type LineMap = Map<number, LineInfo>;

function convertToMap(items: LineInfo[]): LineMap {
    return new Map(items.map(item => [item.line, item]));
}

// const fileMap = convertToMap(fileInfo);

class InfoProvider {

    private _fileMap: Map<string, LineMap> = new Map();

    public updateInfo(fileName: string, fileInfo: LineInfo[]) {
        this._fileMap.set(fileName, convertToMap(fileInfo));
    }

    public getLineInfo(file:string, line: number) : LineInfo | undefined {
        return this._fileMap.get(file)?.get(line);
    }

}

class FluxViewProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;
    private _currentLine: number = 0;
    private _currentColumn: number = 0;
    private _currentRcx : string = "...";
    private _currentEnv : string = "...";
    private _fontFamily: string | undefined = 'Arial';
    private _fontSize: number | undefined = 14;

    constructor(private readonly _extensionUri: vscode.Uri, private readonly _infoProvider: InfoProvider) {}

    public updateFluxView(file: string, line: number, column: number) {
        this._currentLine = line;
        this._currentColumn = column;
        const info = this._infoProvider.getLineInfo(file, line);

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

async function checkAndLoadFile(document: vscode.TextDocument, context: vscode.ExtensionContext, infoProvider: InfoProvider) {
    if (document.fileName.endsWith('.rs')) {
        try {
            const lineInfo = await readLineInfoFromWorkspace(document.fileName);
            infoProvider.updateInfo(document.fileName, lineInfo);
            console.log('Loaded line info:', lineInfo);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to load line info: ${error}`);
        }
    }
}


async function readLineInfoFromWorkspace(fileName: string): Promise<LineInfo[]> {
    try {
        // Get the workspace folder
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            return [];
            // throw new Error('No workspace folder open: ' + srcFile);
        }

        // Construct path to the JSON file in the workspace
        const workspacePath = workspaceFolders[0].uri.fsPath;
        const logPath = path.join(workspacePath, "log/checker");

        // Read the file using VS Code's file system API
        const relativeFileName = path.relative(workspacePath, fileName);
        const logUri = vscode.Uri.file(logPath);
        const logData = await vscode.workspace.fs.readFile(logUri);
        const logString = Buffer.from(logData).toString('utf8');

        // Parse the logString
        const data = parseLineInfo(relativeFileName, logString);

        return data;
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to read line info: ${error}`);
        return [];
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

function statementSpan(span: string): StmtSpan | undefined {
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

function isStatementEvent(fileName: string, event: any): LineInfo | undefined {
    if (event.fields.event === 'statement_end') {
        const stmt_span = statementSpan(event.fields.stmt_span);
        if (stmt_span && stmt_span.file === fileName) {
            return {line: stmt_span.end_line, rcx: event.fields.rcx, env: event.fields.env};
        }
    }
    return undefined;
}

function parseLineInfo(fileName: string, logString: string): LineInfo[] {
    const events = logString.split('\n').filter(line => line.trim()).map(line => JSON.parse(line));
    const res = events.map(event => isStatementEvent(fileName, event)).filter(info => info !== undefined) as LineInfo[];
    return res;
}