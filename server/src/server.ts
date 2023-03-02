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
	FileChangeType,
	Hover,
	MarkupKind,
	DocumentHighlight,
	DocumentDiagnosticParams,
	FullDocumentDiagnosticReport,
	DocumentDiagnosticReportKind,
	TextDocumentSyncKind,
	TextDocumentPositionParams,
	SemanticTokens,
	SemanticTokenTypes,
	SemanticTokensParams} from 'vscode-languageserver/node';

import {
	TextDocument
} from 'vscode-languageserver-textdocument';

import { Glossary, Term } from './Glossary';
import { glob } from 'glob';
import { URI } from 'vscode-uri';
import { resolve } from 'path';
import { RetrieveNamesRequest, RetrieveNamesResponse } from './protocolExtension';

const PATTERN = /\(-(?<pattern>[^@)]+)(@(?<source>[^)]+))?\)/g;
const HOVER_PATTERN = /^\(-(?<pattern>[^@)]+)(@(?<source>[^)]+))?\)/;

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
			textDocumentSync: TextDocumentSyncKind.Incremental,
			codeActionProvider: true,
			hoverProvider: true,
			executeCommandProvider: {
				commands: ['writer-name-handler.markAsKnown']
			},
			documentHighlightProvider: true,
			diagnosticProvider: {
				documentSelector: null,
				interFileDependencies: false,
				workspaceDiagnostics: false,
			},
			semanticTokensProvider: {
				range: false,
				full: {
					delta: false
				},
				legend: {
					tokenTypes: [
						SemanticTokenTypes.macro,
					],
					tokenModifiers: [
					]
				}
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

connection.onHover(({ textDocument, position }): Hover | undefined => {
	const document = documents.get(textDocument.uri);
	if (!document) {
		return undefined;
	}
	const line = document.getText(
		{
			start: { line: position.line, character: 0 },
			end: { line: position.line + 1, character: 0 }
		}
	);

	// check if a pattern is in the range of the current position
	let startChar = position.character;
	let m: RegExpMatchArray | null = null;
	let found = false;
	while (startChar > 0) {
		if (line.charAt(startChar) == '('
			&& (m = line.substring(startChar).match(HOVER_PATTERN))
			&& m[0].length + startChar > position.character) {
			found = true;
			break;
		}
		--startChar;
	}
	if (m && m.groups && found) {
		const quote = m.groups['source'] || m.groups['pattern'];
		const term = glossary.resolve(quote);
		if (term) {
			connection.console.log(`Found '${quote}' at position ${startChar}`);
			const markdown = {
				kind: MarkupKind.Markdown,
				value: formatTerm(term, quote)
			};
			return {
				contents: markdown,
				range: {
					start: { line: position.line, character: startChar },
					end: { line: position.line, character: startChar + m[0].length }
				}
			};
		}
	} else {
		return undefined;
	}
});

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


connection.onDocumentHighlight(({ textDocument, position }: TextDocumentPositionParams): DocumentHighlight[] => {
	connection.console.log(`onDocumentHighlight(position: ${position.line}/${position.character})`);
	const doc = documents.get(textDocument.uri);
	if (!doc) {
		return [];
	}
	return [];
});

connection.languages.diagnostics.on((params: DocumentDiagnosticParams): FullDocumentDiagnosticReport => {
	const doc = documents.get(params.textDocument.uri);
	const res: FullDocumentDiagnosticReport = {
		kind: DocumentDiagnosticReportKind.Full,
		items: []
	};
	if (doc) {
		res.items = validateTextDocument(doc);
	}
	return res;
});

connection.onRequest(RetrieveNamesRequest.method, (): RetrieveNamesResponse => {
	return {
		terms: [... glossary.terms.values()]
			.filter(t => t.term === undefined)
	};
});

connection.onExecuteCommand(async (params) => {
	if (params.command !== 'writer-name-handler.markAsKnown' || params.arguments === undefined) {
		return;
	}
	const args = params.arguments[0];
	const termName = args.termName;

	connection.window.showInformationMessage(`Writer-Name-Handler won't underline '${termName}' for you anymore in this context. If you change your mind, you can delete it from .jargon.known.yml at the root of your workspace.`);
});

connection.languages.semanticTokens.on(({textDocument}: SemanticTokensParams): SemanticTokens => {
	const doc = documents.get(textDocument.uri);
	if (!doc) {
		return { data: [] };
	}
	return { data: buildSemanticTokens(doc) };
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
		glob('**/names.y?(a)ml', { cwd: path }, (err, matches) => {
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

function formatTerm(term: Term, quote: string): string {
	const parts = [];
	let aka: string[] = term.aka;
	if (term.term) {
		term = term.term;
	}
	if (term.aka.length > 0) {
		aka = term.aka.map(x => x == quote ? `**${x}**` : x);
		const name = term.lowercaseName == quote.toLowerCase() ? `**${term.name}**` : term.name;
		parts.push(`${name}:  Also known as ${aka.join(', ')}.`);
		if (term.description) {
			parts.push(term.description);
		}
	} else if (term.description) {
		parts.push(`**${term.name}**: ${term.description}`);
	} else {
		parts.push(`**${term.name}**: *No description available*`);
	}

	return parts.join('\n\n');
}

function validateTextDocument(textDocument: TextDocument): Diagnostic[] {
	const text = textDocument.getText();
	let m: RegExpExecArray | null;

	const diagnostics: Diagnostic[] = [];
	try {
		while ((m = PATTERN.exec(text)) && m.groups) {
			const res = m.groups['source'] || m.groups['pattern'];
			const found = glossary.resolve(res);
			if (!found) {
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
	// BE AWARE: The following line floods your log
	// connection.console.log(`Process ${textDocument.uri}: ${text.length} -> ${diagnostics.length}`);

	return diagnostics;
}

function buildSemanticTokens(textDocument: TextDocument): number[] {
	let currentLine = 0;
	let currentCharacter = 0;
	const tokens: number[] = [];

	const text = textDocument.getText();
	let m: RegExpExecArray | null;

	const lines = text.split(/\r\n|\r|\n/g);
	try {
		for (let lineno = 0; lineno < lines.length; lineno++) {
			while ((m = PATTERN.exec(lines[lineno])) && m.groups) {
				const res = m.groups['source'] || m.groups['pattern'];
				const found = glossary.resolve(res);
				if (found) {
					const tokenLine = lineno - currentLine;
					if (tokenLine > 0) {
						currentCharacter = 0; // restart line
						currentLine = lineno;
					}
					const len = m[0].length;
					//connection.console.log(` build token: [${tokenLine}, ${m.index - currentCharacter}, ${len}, 0, 0]`);
					tokens.push(tokenLine, m.index - currentCharacter, len, 0, 0);
					currentCharacter = m.index;
				}
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
		connection.sendDiagnostics({
			uri: textDocument.uri,
			diagnostics: [diagnostic]
		});
	}

	return tokens;
}
