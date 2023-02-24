/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as vscode from 'vscode';
import * as assert from 'assert';
import { getDocUri, activate, setTestContent, sleep } from './helper';

suite('Should get diagnostics', () => {
	test('Check simple one', async () => {
		await runDiagnosticsTest('(-test)', [
			{
				message: 'notused:  Also known as learning_rate, **test**.\n' +
					'\n' +
					'How big a step we take in each learning step',
				range: toRange(0, 0, 0, 7),
				severity: vscode.DiagnosticSeverity.Information,
				source: 'writer-name'
			},
		]);
	});
	test('Check no diagnostics', async () => {
		await runDiagnosticsTest('Some simple text.', []);
	});
});
/* 
			{ message: 'ANY is all uppercase.', range: toRange(0, 0, 0, 3), severity: vscode.DiagnosticSeverity.Hint, source: 'ex' },
			{ message: 'ANY is all uppercase.', range: toRange(0, 14, 0, 17), severity: vscode.DiagnosticSeverity.Hint, source: 'ex' },
			{ message: 'OS is all uppercase.', range: toRange(0, 18, 0, 20), severity: vscode.DiagnosticSeverity.Hint, source: 'ex' }
*/
function toRange(sLine: number, sChar: number, eLine: number, eChar: number) {
	const start = new vscode.Position(sLine, sChar);
	const end = new vscode.Position(eLine, eChar);
	return new vscode.Range(start, end);
}

function testDiagnostics(docUri: vscode.Uri, expectedDiagnostics: vscode.Diagnostic[]) {
	let actualDiagnostics = vscode.languages.getDiagnostics(docUri);
	actualDiagnostics = actualDiagnostics.filter(x => x.source === "writer-names");

	assert.equal(actualDiagnostics.length, expectedDiagnostics.length);

	expectedDiagnostics.forEach((expectedDiagnostic, i) => {
		const actualDiagnostic = actualDiagnostics[i];
		assert.equal(actualDiagnostic.message, expectedDiagnostic.message);
		assert.deepEqual(actualDiagnostic.range, expectedDiagnostic.range);
		assert.equal(actualDiagnostic.severity, expectedDiagnostic.severity);
	});
}

async function runDiagnosticsTest(text: string, expected: vscode.Diagnostic[]) {
	const docUri = getDocUri('empty.md');
	await activate().then(async () => {
		const doc = await vscode.workspace.openTextDocument(docUri);
		const editor = await vscode.window.showTextDocument(doc);
		await sleep(2000);
		await setTestContent(editor.document, editor, text)
			.then(async () => {
				await sleep(1000);
				testDiagnostics(doc.uri, expected);
			});
	});
}