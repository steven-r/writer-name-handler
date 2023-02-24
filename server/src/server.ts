import {
	createConnection,
	TextDocuments,
	Diagnostic,
	DiagnosticSeverity,
	ProposedFeatures,
	InitializeParams,
	InitializeResult,
	WorkspaceFolder,
	CodeAction,
	Command,
	CodeActionKind,
	FileEvent,
	FileChangeType
} from 'vscode-languageserver/node';

import {
	TextDocument
} from 'vscode-languageserver-textdocument';

import { Glossary } from './Glossary';
import { glob } from 'glob';
import { URI } from 'vscode-uri';
import { resolve } from 'path';

const PATTERN = /\(-(?<pattern>[^@)]+)(@(?<source>[^)]+))?\)/g;

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;

const glossary = new Glossary(connection);


connection.onInitialize((params: InitializeParams) => {
	connection.console.log("Hello from server");
	if (params.workspaceFolders) {
		compileGlossaryFromWorkspaceFolders(params.workspaceFolders);
	}

	const capabilities = params.capabilities;

	// Does the client support the `workspace/configuration` request?
	// If not, we fall back using global settings.
	hasWorkspaceFolderCapability = !!(
		capabilities.workspace && !!capabilities.workspace.workspaceFolders
	);
	hasDiagnosticRelatedInformationCapability = !!(
		capabilities.textDocument &&
		capabilities.textDocument.publishDiagnostics &&
		capabilities.textDocument.publishDiagnostics.relatedInformation
	);

	const result: InitializeResult = {
		capabilities: {
			codeActionProvider: true,
			executeCommandProvider: {
				commands: ['writer-name-handler.markAsKnown']
			}
		}
	};
	if (hasWorkspaceFolderCapability) {
		result.capabilities.workspace = {
			workspaceFolders: {
				supported: true
			}
		};
	}
	return result;
});

function reloadGlossary(folders: WorkspaceFolder[]) {
	documents.all().forEach(validateTextDocument);
}

connection.onInitialized(() => {
	if (hasWorkspaceFolderCapability) {
		connection.workspace.onDidChangeWorkspaceFolders(_event => {
			connection.console.log('Workspace folder change event received.');
			connection.workspace.getWorkspaceFolders().then(folders => {
				if (folders) {
					reloadGlossary(folders);
				}
			});
		});
	}
});


// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent(change => {
	validateTextDocument(change.document);
});


async function validateTextDocument(textDocument: TextDocument): Promise<void> {
	const text = textDocument.getText();
	let m: RegExpExecArray | null;

	const diagnostics: Diagnostic[] = [];
	try {
		while ((m = PATTERN.exec(text)) && m.groups) {
			const res = m.groups['source'] || m.groups['pattern'];
			const found = glossary.resolve(res);
			if (found) {
				const parts = [];
				let term = found;
				let aka: string[] = term.aka;
				if (term.term) {
					term = term.term;
				}
				if (term.aka.length > 0) {
					aka = term.aka.map(x => x == res ? `**${x}**` : x);
					parts.push(`${term.name}:  Also known as ${aka.join(', ')}.`);
				} else {
					parts.push(`${term.name},`);
				}
				if (term.description !== undefined) {
					parts.push(term.description);
				}
	
				const message = parts.join('\n\n');
				const diagnostic: Diagnostic = {
					severity: DiagnosticSeverity.Information,
					range: {
						start: textDocument.positionAt(m.index),
						end: textDocument.positionAt(m.index + m[0].length)
					},
					message: message,
					source: 'writer-names',
					data: {
						termName: term.name
					}
				};
				if (hasDiagnosticRelatedInformationCapability) {
					diagnostic.relatedInformation = [];
				}
	
				diagnostics.push(diagnostic);
			} else {
				const diagnostic: Diagnostic = {
					severity: DiagnosticSeverity.Warning,
					range: {
						start: textDocument.positionAt(m.index),
						end: textDocument.positionAt(m.index + m[0].length)
					},
					message: `Unknown term ${m[0]}`,
					source: 'writer-names',
					data: {
						termName: m[0]
					}
				};
				if (hasDiagnosticRelatedInformationCapability) {
					diagnostic.relatedInformation = [];
				}
	
				diagnostics.push(diagnostic);
			}
		}
	} catch (error: any) {
		connection.console.error(error.message);
		const diagnostic: Diagnostic = {
			severity: DiagnosticSeverity.Error,
			message: error.message,
			range: {
				start: textDocument.positionAt(0), end: textDocument.positionAt(1)
			},
		};
		diagnostics.push(diagnostic);
	}
	// BE AWARE: The following line fills your log
	// connection.console.log(`Process ${textDocument.uri}: ${text.length} -> ${diagnostics.length}`);

	// Send the computed diagnostics to VSCode.
	connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

connection.onDidChangeWatchedFiles(change => {
	change.changes.forEach((element: FileEvent) => {
		if (element.type == FileChangeType.Created || element.type == FileChangeType.Changed) {
			glossary.loadFile(element.uri);
		} else if (element.type == FileChangeType.Deleted) {
			glossary.forgetFile(element.uri);
		}
	});
});

connection.onCodeAction(params => {
	const diagnostics = params.context.diagnostics;
    if (!diagnostics || diagnostics.length === 0) {
        return [];
    }

	const textDocument = documents.get(params.textDocument.uri);
	if (textDocument === undefined) {
		return undefined;
	}

	const codeActions: CodeAction[] = [];
    diagnostics.forEach((diag) => {
		if (diag.source === 'jargon') {
			codeActions.push({
				title: 'Mark as known',
				kind: CodeActionKind.QuickFix,
				diagnostics: [diag],
				command: Command.create('Mark as known', 'jargon.markAsKnown', (diag.data! as any))
			});
		}
	});
	return codeActions;
});

connection.onExecuteCommand(async (params) => {
	if (params.command !== 'jargon.markAsKnown' || params.arguments === undefined) {
		return;
	}
	const args = params.arguments[0];
	const termName = args.termName;

	connection.window.showInformationMessage(`Jargon won't underline '${termName}' for you anymore in this context. If you change your mind, you can delete it from .jargon.known.yml at the root of your workspace.`);
});

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();

function compileGlossaryFromWorkspaceFolders(workspaceFolders: WorkspaceFolder[]) {
	workspaceFolders.forEach(folder => {
		connection.console.log(`Processing folder ${folder.name}: ${folder.uri}`);
		const uri = URI.parse(folder.uri);
		const path = uri.fsPath || uri.path;
		glob('**/names.y?(a)ml', {cwd: path}, (err, matches) => {
			if (err) {
				connection.console.warn(err.message);
				return;
			}
			matches.forEach(match => {
				glossary.loadFile(URI.file(resolve(path, match)).toString());
			});
		});
	});
}
