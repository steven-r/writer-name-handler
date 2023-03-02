/* --------------------------------------------------------------------------------------------
 * Copyright (c) Stephen Reindl. All rights reserved.
 * Copyright (c) Remy Suen. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as child_process from "child_process";
import * as assert from "assert";
import { Diagnostic, DiagnosticSeverity, Hover, Position, Range } from "vscode-languageserver";
import path from 'path';

// fork the server and connect to it using Node IPC
const lspProcess = child_process.fork("./out/server.js", ["--node-ipc"]);
let messageId = 1;

function sendNotification(method: string, params: any): void {
	const message = {
		jsonrpc: "2.0",
		method: method,
		params: params
	};
	//console.log(`--] ${JSON.stringify(message)}`);
	lspProcess.send(message);
}

function sendRequest(method: string, params: any): number {
	const message = {
		jsonrpc: "2.0",
		id: messageId++,
		method: method,
		params: params
	};
	//console.log(`--> ${JSON.stringify(message)}`);
	lspProcess.send(message);
	return messageId - 1;
}

function sendResult(id: number, result: any): void {
	lspProcess.send({ jsonrpc: "2.0", id, result });
}

function initialize(): number {
	return initializeCustomCapabilities({
		workspace: {
			configuration: true,
			workspaceFolders: true,
			fileOperations: true,
		},
		textDocument: {
			completion: {
				completionItem: {
					deprecatedSupport: true,
					snippetSupport: true
				}
			},
			hover: true,
			semanticTokens: {
				formats: [],
				requests: {
					full: {
						delta: false
					}
				},
				tokenModifiers: ["macro"],
				tokenTypes: []
			}
		}
	});
}

function initializeCustomCapabilities(capabilities: any): number {
	return sendRequest("initialize", {
		rootPath: process.cwd(),
		processId: process.pid,
		capabilities: capabilities,
		trace: "verbose"
	});
}

const responses: Record<number, any> = {};

const messageHandler = (json: any) => {
	// console.log(`<-- ${JSON.stringify(json)}`);
	if (json.method && json.method === 'window/logMessage') {
		switch (json.params.type) {
			case 1: console.error(json.params.message); break;
			case 2: console.warn(json.params.message); break;
			case 3: console.info(json.params.message); break;
			//case 4: console.log(json.params.message); break;
			default:
				break;
		}
	} else {
		responses[json.id] = json;
	}
};

async function sleep(ms: number) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

const waitForResponse = async (responseId: number, timeout = 4000): Promise<any> => {
	let time = 0;
	const i = 1;
	while (!responses[responseId] && time < timeout) {
		const waittime = 10 * i * (i + 1) / 2;
		await sleep(waittime);
		time += waittime;
	}
	if (responses[responseId]) {
		if (responses[responseId].error) {
			return Promise.reject(responses[responseId].error);
		} else {
			return responses[responseId].result;
		}
	}
	throw new Error(`Timeout occurred after ${timeout} milliseconds`);
};

lspProcess.on('message', messageHandler);

describe("LSP server with configuration support", function () {
	it("initialize", async () => {
		//this.timeout(5000);
		const responseId = initialize();
		const json = await waitForResponse(responseId);
		assert.notEqual(json.capabilities, null);
		const capabilities = json.capabilities;
		assert.equal(capabilities.hoverProvider, true);
		assert.equal(capabilities.documentHighlightProvider, true);
		assert.equal(capabilities.semanticTokensProvider.full.delta, false);
		assert.equal(capabilities.semanticTokensProvider.legend.tokenTypes.length, 1);
		assert.equal(capabilities.semanticTokensProvider.legend.tokenTypes[0], "macro");
	});

	it("initialized", () => {
		sendNotification("initialized", {});
	});

	it("load config file", () => {
		this.timeout(5000);
		// workspace/didChangeWatchedFiles
		const workspaceChangeWatchedFiles = {
			changes: [
				{
					uri: path.resolve(__dirname, "../../../test/names.yml"),
					type: 1
				}
			]
		};
		sendNotification("workspace/didChangeWatchedFiles", workspaceChangeWatchedFiles);
	});

	it("Retrieve names", async () => {
		const id = sendRequest("$custom/getNames", {});
		const response = await waitForResponse(id);
		assert.equal(response.terms.length, 2);
		assert.deepEqual(response.terms.map((t: any) => t.name), ["name", "test"]);
	});

	it("load empty file results in empty diagnostics", async () => {
		await checkDiags("", []);
	});

	it("load file without names", async () => {
		await checkDiags("# header\n\nSome regular text.\nMore **lines**.", []);
	});

	it("load file with existing name", async () => {
		await checkDiags("# header\n\nSome regular text: (-test).\nMore **lines**.", []);
	});

	it("load file with missing name", async () => {
		await checkDiags("# header\n\nSome regular text: (-notthere).\nMore **lines**.", [
			{
				message: 'Unknown term (-notthere)',
				range: toRange(2, 19, 2, 30),
				severity: DiagnosticSeverity.Warning,
				source: 'writer-name'
			},
		]);
	});

	it("Hint: Check empty response", async () => {
		await checkHint("# header\n\nSome regular text: (-notthere).\nMore **lines**.", 0, 0, null);
	});

	it("Hint: Check single response", async () => {
		await checkHint("# header\n\nSome regular text: (-test).\nMore **lines**.",
			2, 20,
			{
				contents: {
					kind: 'markdown',
					value: '**test**:  Also known as learning_rate, lr.\n\n' +
						'How big a step we take in each learning step'
				},
				range: {
					start: { line: 2, character: 19 },
					end: { line: 2, character: 26 }
				}
			});
	});

	it("Hint: Check response (Alt-Text)", async () => {
		await checkHint("# header\n\nSome regular text: (-mockup@test).\nMore **lines**.",
			2, 20,
			{
				contents: {
					kind: 'markdown',
					value: '**test**:  Also known as learning_rate, lr.\n\n' +
						'How big a step we take in each learning step'
				},
				range: {
					start: { line: 2, character: 19 },
					end: { line: 2, character: 33 }
				}
			});
	});

	it("Hint: Check response (Aka)", async () => {
		await checkHint("# header\n\nSome regular text: (-lr).\nMore **lines**.",
			2, 20,
			{
				contents: {
					kind: 'markdown',
					value: '**test**:  Also known as learning_rate, **lr**.\n\n' +
						'How big a step we take in each learning step'
				},
				range: {
					start: { line: 2, character: 19 },
					end: { line: 2, character: 24 }
				}
			});
	});

	it("SemanticToken: Empty Response", async () => {
		await checkSemanticTokens("# header\n\nSome regular text.\nMore **lines**.", []);
	});

	it("SemanticToken: Empty response with unknown elements", async () => {
		await checkSemanticTokens("# header\n\nSome regular text (-unknown).\nMore **lines**.", []);
	});

	it("SemanticToken: Empty response with known element", async () => {
		await checkSemanticTokens("# header\n\nSome regular text (-test).\nMore **lines**.",
			[
				2, 18, 7, 0, 0
			]);
	});

	it("SemanticToken: Empty response with aka element", async () => {
		await checkSemanticTokens("# header\n\nSome regular text (-lr).\nMore **lines**.",
			[
				2, 18, 5, 0, 0
			]);
	});

	it("SemanticToken: Empty response with alt element", async () => {
		await checkSemanticTokens("# header\n\nSome regular text (-unknown@test).\nMore **lines**.",
			[
				2, 18, 15, 0, 0
			]);
	});

	it("SemanticToken: Empty response with multiple element", async () => {
		await checkSemanticTokens("# header (-test)\n(-notknown)\nSome regular (-test) text (-test).\nMore (-test)(-test)**lines**.",
			[
				0, 9, 7, 0, 0, 		// first line offset 9
				2, 13, 7, 0, 0,		// 3rd line offset 13
				0, 13, 7, 0, 0,		// 3rd line offset 26
				1, 5, 7, 0, 0,		// 4th line offset 5
				0, 7, 7, 0, 0		// 4th line offset 12
			]);
	});

	after(() => {
		// terminate the forked LSP process after all the tests have been run
		lspProcess.kill();
	});

	const check = async (text: string, buildRequest: (uri: string) => number, handleResponse: (json: any) => void) => {
		this.timeout(5000);
		const filename = `uri://markdown/file-${messageId}.md`;
		sendNotification("textDocument/didOpen", {
			textDocument: {
				languageId: "markdown",
				uri: filename,
				version: 1,
				text
			}
		});
		const id = buildRequest(filename);
		const response = await waitForResponse(id);
		sendNotification("textDocument/didClose", {
			textDocument: { uri: filename }
		});
		handleResponse(response);
	};

	const checkHint = async (text: string, line: number, character: number, expected: Hover | null) => {
		await check(text, (filename: string): number => {
			return sendRequest('textDocument/hover', {
				textDocument: { uri: filename },
				position: { line, character }
			});
		},
			(response: any): void => {
				if (expected) {
					assert.notEqual(response, null);
					assert.deepEqual(expected.contents, expected.contents);
					if (expected.range) {
						assert.deepEqual(expected.range, response.range);
					}
				} else {
					assert.equal(expected, null);
				}
			});
	};

	const checkSemanticTokens = async (text: string, expected: number[]) => {
		await check(text, (filename: string): number => {
			return sendRequest('textDocument/semanticTokens/full', {
				textDocument: { uri: filename }
			});
		},
			(response: any): void => {
				assert.deepEqual(response.data, expected);
			});
	};

	const checkDiags = async (text: string, diagnostics: Diagnostic[]) => {
		await check(text,
			(filename: string): number => {
				return sendRequest("textDocument/diagnostic", {
					textDocument: { uri: filename }
				});
			},
			(response: any): void => {
				assert.equal(response.items.length, diagnostics.length);
				diagnostics.forEach((diagnostic, i) => {
					const current = response.items[i];
					assert.equal(current.message, diagnostic.message);
					assert.equal(current.severity, diagnostic.severity);
				});
			});
	};
});

function toRange(sLine: number, sChar: number, eLine: number, eChar: number) {
	const start = Position.create(sLine, sChar);
	const end = Position.create(eLine, eChar);
	return Range.create(start, end);
}
