import { readFileSync } from 'fs';
import { Connection, _Connection } from 'vscode-languageserver';
import { URI } from 'vscode-uri';

import * as YAML from 'yaml';

export class Term {
	public lowercaseName: string;
	public name: string;
	public aka: string[];
	public term?: Term; // parent of aka term
	public description?: string;
	public namespace: string;

	constructor(name: string, namespace: string, description?: string, parent?: Term) {
		this.name = name;
		this.lowercaseName = name.toLowerCase();
		this.aka = [];
		this.namespace = namespace;
		this.description = description;
		this.term = parent;
	}
}

export class Glossary {
	namespaces: Array<string> = [];
	unknownTerms: Array<string> = [];
	terms: Map<string, Term> = new Map();
	connection: Connection;

	constructor(connection: Connection) {
		this.connection = connection;
	}

	loadFile(path: string) {
		try {
			const uri = URI.parse(path);
			if (uri.scheme !== "file") {
				this.connection.console.warn(`Cannot process scheme ${uri.scheme} for ${path}`);
			}
			const file = readFileSync(uri.path, 'utf8');
			const doc = YAML.parse(file);
			this.forgetFile(uri.path);
			let cnt = 0;
			let aliases = 0;
			for (const [termName, value] of Object.entries(doc)) {
				const v = value as any;
				const termAka = v['aka'] as string[];
				const termDesc = v['description'];

				const term: Term = new Term(termName, uri.path, termDesc);
				if (typeof termAka === 'string') {
					term.aka.push(termAka);
				} else if (Array.isArray(termAka)) {
					term.aka.push(...termAka);
				}
				this.terms.set(term.lowercaseName, term);
				cnt++;
				term.aka.forEach(a => {
					aliases++;
					const aka = new Term(a, uri.path, undefined, term);
					this.terms.set(aka.lowercaseName, aka);
				});
			}
			this.connection.console.log(`Loaded ${path}: Terms: ${cnt}, aliases: ${aliases}`);
		}
		catch (e: any) {
			this.connection.console.error(`Error loading ${path}`);
			this.connection.console.error(e.message);
			if (e.stack) {
				this.connection.console.error(e.stack);
			}
		}
	}

	isEmpty(): boolean {
		return this.namespaces.length === 0;
	}

	markAsUnknown(termName: string) {
		this.unknownTerms.push(termName);
	}

	resolve(query: string): Term | undefined {
		query = query.toLowerCase();
		if (this.unknownTerms.indexOf(query) > -1) {
			return undefined; // not known
		}

		const found = this.terms.get(query) || this.terms.get(query + 's');
		return found;
	}

	clear() {
		this.namespaces = [];
		this.unknownTerms = [];
	}

	forgetFile(path: string) {
		const uri = URI.parse(path);
		if (uri.scheme !== "file") {
			this.connection.console.warn(`Cannot process scheme ${uri.scheme} for ${path}`);
		}
		this.terms = new Map([...this.terms].filter(([k, v]) => v.namespace !== uri.path));
		this.namespaces = this.namespaces.filter(ns => ns !== uri.path);
	}
}
