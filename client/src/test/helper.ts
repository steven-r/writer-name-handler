/* --------------------------------------------------------------------------------------------
 * Copyright (c) Stephen Reindl. All rights reserved.
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as vscode from 'vscode';
import * as path from 'path';

export let ext: vscode.Extension<any>;
export let documentEol: string;
export let platformEol: string;

/**
 * Activates the extension
 */
export async function activate(): Promise<any> {
	if (ext) 
		return ext;
	// The extensionId is `publisher.name` from package.json
	ext = vscode.extensions.getExtension('sreindl.writer-name-handler')!;
	return ext.activate();
}

export async function openDocument(docUri: vscode.Uri): Promise<[vscode.TextDocument, vscode.TextEditor]> {
	let doc: vscode.TextDocument;
	let editor: vscode.TextEditor;
	try {
		doc = await vscode.workspace.openTextDocument(docUri);
		editor = await vscode.window.showTextDocument(doc);
	} catch (e) {
		console.error(e);
	}
	return Promise.all<[vscode.TextDocument, vscode.TextEditor]>
		([doc, editor]);
}

export async function sleep(ms: number) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

export const getDocPath = (p: string) => {
	return path.resolve(__dirname, '../../testFixture', p);
};
export const getDocUri = (p: string) => {
	return vscode.Uri.file(getDocPath(p));
};

export async function setTestContent(doc: vscode.TextDocument, 
	editor: vscode.TextEditor, 
	content: string): Promise<boolean> {
	const all = new vscode.Range(
		doc.positionAt(0),
		doc.positionAt(doc.getText().length)
	);
	return editor.edit(eb => eb.replace(all, content));
}
