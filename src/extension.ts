// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

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


	// Register a custom webview panel
	const cursorViewProvider = new CursorPositionViewProvider(context.extensionUri);

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider('cursorPositionView', cursorViewProvider)
	);

	// Listener to track cursor position
	context.subscriptions.push(
		vscode.window.onDidChangeTextEditorSelection((event) => {
			if (event.textEditor) {
				const position = event.textEditor.selection.active;
				cursorViewProvider.updateCursorPosition(position.line + 1, position.character + 1);
			}
		})
	);

}

// This method is called when your extension is deactivated
export function deactivate() {}



class CursorPositionViewProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;
    private _currentLine: number = 0;
    private _currentColumn: number = 0;

    constructor(private readonly _extensionUri: vscode.Uri) {}

    public updateCursorPosition(line: number, column: number) {
        this._currentLine = line;
        this._currentColumn = column;

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
                        /* color: red; */
                        font-size: 16px;
                        font-weight: bold;
                    }
                </style>
            </head>
            <body>
                <div id="cursor-position">
                    Line: ${this._currentLine}, Column: ${this._currentColumn}
                </div>
            </body>
            </html>
        `;
    }
}