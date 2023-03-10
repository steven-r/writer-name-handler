/* --------------------------------------------------------------------------------------------
 * Copyright (c) Stephen Reindl. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

/* eslint-disable @typescript-eslint/prefer-as-const */
/* eslint-disable @typescript-eslint/no-namespace */
import { MessageDirection, ProtocolRequestType } from 'vscode-languageserver';
import { Term } from './Glossary';

export interface RetrieveNamesResponse {
	terms: Term[];
}

export namespace RetrieveNamesRequest {
	export const method: '$custom/getNames' = '$custom/getNames';
	export const messageDirection: MessageDirection = MessageDirection.clientToServer;
	export const type = new ProtocolRequestType<void, RetrieveNamesResponse, void, void, void>(method);
}
