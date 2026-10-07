import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import ts from 'typescript';

test('the checked command union accounts for every main reducer branch', () => {
  const config = ts.readConfigFile('tsconfig.json', ts.sys.readFile);
  if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, '.');
  const program = ts.createProgram(parsed.fileNames, parsed.options), checker = program.getTypeChecker();
  const source = program.getSourceFile('src/engine/gameCommands.ts');
  if (!source) throw new Error('Missing command contract.');
  const alias = source.statements.find((node): node is ts.TypeAliasDeclaration => ts.isTypeAliasDeclaration(node) && node.name.text === 'GameCommand');
  if (!alias) throw new Error('Missing GameCommand alias.');
  const command = checker.getTypeAtLocation(alias), property = command.getProperty('type');
  if (!property) throw new Error('Commands need a discriminant.');
  const tags = checker.getTypeOfSymbolAtLocation(property, alias);
  if (!tags.isUnion()) throw new Error('Command tags must form a finite union.');
  const names = tags.types.map(tag => {
    if (!tag.isStringLiteral()) throw new Error('Command tag is not a string literal.');
    return tag.value;
  });
  const reducer = ts.createSourceFile('gameReducer.js', fs.readFileSync('src/engine/gameReducer.js', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const fn = reducer.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === 'reduceGame');
  const main = fn?.body?.statements.find(ts.isSwitchStatement);
  if (!main) throw new Error('Missing reducer command switch.');
  const branches = main.caseBlock.clauses.filter(ts.isCaseClause).map(branch => {
    if (!ts.isStringLiteral(branch.expression)) throw new Error('Reducer branch is not a literal command.');
    return branch.expression.text;
  });
  assert.equal(new Set(branches).size, branches.length, 'Duplicate main command handler.');
  assert.deepEqual([...names].sort(), [...branches].sort());
});
