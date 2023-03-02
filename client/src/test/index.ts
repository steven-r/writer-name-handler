/* --------------------------------------------------------------------------------------------
 * Copyright (c) Stephen Reindl. All rights reserved.
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as path from 'path';
import * as Mocha from 'mocha';
import * as glob from 'glob';
import * as fs from 'fs';

export function run(): Promise<void> {
	// Create the mocha test
	const mocha = new Mocha({
		ui: 'tdd',
		color: true
	});
	mocha.timeout(100000);

	const testsRoot = __dirname;

	return new Promise((resolve, reject) => {
		glob('**.test.js', { cwd: testsRoot }, (err, files) => {
			if (err) {
				return reject(err);
			}

			// Add files to the test suite
			files.forEach(f => mocha.addFile(path.resolve(testsRoot, f)));

			try {
				// Run the mocha test
				mocha.run(failures => {
					if (failures > 0) {
						grabExtensionOutput(mocha);
						reject(new Error(`${failures} tests failed.`));
					} else {
						resolve();
					}
				});
			} catch (err) {
				console.error(err);
				reject(err);
			}
		});
	});
}

function grabExtensionOutput(mocha: Mocha): string[] {
	const res: string[] = [];
	const logFolder = path.resolve(__dirname, '../../../.vscode-test/user-data/logs');
	const files = glob.sync('**/*1-Writer Names Language Server.log', { cwd: logFolder });
	files.forEach(f => {
		const text = fs.readFileSync(path.resolve(logFolder, f), 'utf8');
		console.warn(`Error output of ${f}:\n${text}`);
	});
	return res;
}
