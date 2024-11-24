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
	const cursorViewProvider = new CursorPositionViewProvider(context.extensionUri, infoProvider);

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider('cursorPositionView', cursorViewProvider)
	);

	// Listener to track cursor position
	context.subscriptions.push(
		vscode.window.onDidChangeTextEditorSelection((event) => {
			if (event.textEditor) {
				const position = event.textEditor.selection.active;
                const fileName = event.textEditor.document.fileName;
				cursorViewProvider.updateCursorPosition(fileName, position.line + 1, position.character + 1);
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

// Hardwire the information for some set of lines

type LineInfo = {
    line: number;
    info: string;
}

type LineMap = Map<number, string>;

function convertToMap(items: LineInfo[]): LineMap {
    return new Map(items.map(item => [item.line, item.info]));
}

// const fileMap = convertToMap(fileInfo);

class InfoProvider {

    private _fileMap: Map<string, LineMap> = new Map();

    public updateInfo(fileName: string, fileInfo: LineInfo[]) {
        this._fileMap.set(fileName, convertToMap(fileInfo));
    }

    public getLineInfo(file:string, line: number) {
        const info = this._fileMap.get(file)?.get(line);
        return info ? info : "???";
    }

}

class CursorPositionViewProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;
    private _currentLine: number = 0;
    private _currentColumn: number = 0;
    private _currentInfo: string = "pig";

    constructor(private readonly _extensionUri: vscode.Uri, private readonly _infoProvider: InfoProvider) {}

    public updateCursorPosition(file: string, line: number, column: number) {
        this._currentLine = line;
        this._currentColumn = column;
        this._currentInfo = this._infoProvider.getLineInfo(file, line);

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

        webviewView.webview.html = this._getHtmlForWebview();
    }

    private _getHtmlForWebview() {
        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Cursor Position</title>
                <style>
                    body {
                        display: flex;
                        justify-content: center;
                        align-items: left;
                        height: 100%;
                        margin: 0;
                        font-family: var(--vscode-font-family);
                        background-color: var(--vscode-editor-background);
                    }
                    #cursor-position {
                        color: green;
                        font-size: 16px;
                        font-weight: bold;
                    }
                </style>
            </head>
            <body>
                <div id="cursor-position">
                    Line ${this._currentLine}: ${this._currentInfo}
                </div>
            </body>
            </html>
        `;
    }
}

async function checkAndLoadFile(document: vscode.TextDocument, context: vscode.ExtensionContext, infoProvider: InfoProvider) {
    // Check if the file matches your criteria
    // For example, if you want to watch a specific file named "target.ts":
    if (document.fileName.endsWith('.rs')) {
        try {
            const infoName = document.fileName.replace('.rs', '.json');
            const lineInfo = await readLineInfoFromWorkspace(infoName);
            // Do something with the lineInfo...
            infoProvider.updateInfo(document.fileName, lineInfo);
            console.log('Loaded line info:', lineInfo);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to load line info: ${error}`);
        }
    }
}


async function readLineInfoFromWorkspace(fileName: string = 'data.json'): Promise<LineInfo[]> {
    try {
        // // Get the workspace folder
        // const workspaceFolders = vscode.workspace.workspaceFolders;
        // if (!workspaceFolders) {
        //     throw new Error('No workspace folder open: ' + fileName);
        // }

        // Construct path to the JSON file in the workspace
        // const filePath = path.join(workspaceFolders[0].uri.fsPath, fileName);

        // Read the file using VS Code's file system API
        const fileUri = vscode.Uri.file(fileName);
        const fileContent = await vscode.workspace.fs.readFile(fileUri);

        // Convert Buffer to string and parse JSON
        const data = JSON.parse(Buffer.from(fileContent).toString('utf8')) as LineInfo[];

        // Validate the data structure
        if (!Array.isArray(data)) {
            throw new Error('Invalid data structure in JSON file');
        }

        return data;
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to read line info: ${error}`);
        return [];
    }
}