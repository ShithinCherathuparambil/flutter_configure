import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import { toSnakeCase, toPascalCase, toCamelCase, parseJsonToModel, getPackageName, ModelProperty, isInjectableEnabled, findProjectRoot, getArchitectureLintRules, getStateManagementLintRules, generateAnalysisOptions, configurePubspecForLints, generateMethodChannelDartFile, configureAndroidMethodChannel, configureIosMethodChannel, ARCHITECTURE_OPTIONS, STATE_MANAGEMENT_OPTIONS } from '../../extension';

suite('Unit Tests', () => {
    // 1. toSnakeCase
    test('toSnakeCase converts various formats to snake_case', () => {
        assert.strictEqual(toSnakeCase('camelCaseString'), 'camel_case_string');
        assert.strictEqual(toSnakeCase('PascalCaseString'), 'pascal_case_string');
        assert.strictEqual(toSnakeCase('hyphenated-string'), 'hyphenated_string');
        assert.strictEqual(toSnakeCase('space separated string'), 'space_separated_string');
        assert.strictEqual(toSnakeCase('already_snake_case'), 'already_snake_case');
    });

    // 2. toPascalCase
    test('toPascalCase converts various formats to PascalCase', () => {
        assert.strictEqual(toPascalCase('camelCase'), 'CamelCase');
        assert.strictEqual(toPascalCase('snake_case'), 'SnakeCase');
        assert.strictEqual(toPascalCase('spaced name'), 'SpacedName');
    });

    // 3. toCamelCase
    test('toCamelCase converts various formats to camelCase', () => {
        assert.strictEqual(toCamelCase('PascalCase'), 'pascalCase');
        assert.strictEqual(toCamelCase('snake_case'), 'snakeCase');
        assert.strictEqual(toCamelCase('spaced name'), 'spacedName');
    });

    // 4. parseJsonToModel
    test('parseJsonToModel parses fields from valid JSON correctly', () => {
        const jsonStr = JSON.stringify({
            id: 1,
            title: 'Test Title',
            price: 19.99,
            isActive: true,
            tags: ['tag1', 'tag2'],
            metadata: { key: 'value' }
        });

        const model = parseJsonToModel('ProductCard', jsonStr);

        assert.strictEqual(model.modelName, 'ProductCard');
        assert.strictEqual(model.modelNamePascal, 'ProductCard');
        assert.strictEqual(model.modelNameSnake, 'product_card');
        assert.strictEqual(model.modelNameCamel, 'productCard');

        // Check parsed properties
        const props = model.properties;
        const idProp = props.find((p: ModelProperty) => p.name === 'id');
        assert.ok(idProp);
        assert.strictEqual(idProp!.type, 'int');

        const titleProp = props.find((p: ModelProperty) => p.name === 'title');
        assert.ok(titleProp);
        assert.strictEqual(titleProp!.type, 'String');

        const priceProp = props.find((p: ModelProperty) => p.name === 'price');
        assert.ok(priceProp);
        assert.strictEqual(priceProp!.type, 'double');

        const activeProp = props.find((p: ModelProperty) => p.name === 'isActive');
        assert.ok(activeProp);
        assert.strictEqual(activeProp!.type, 'bool');

        const tagsProp = props.find((p: ModelProperty) => p.name === 'tags');
        assert.ok(tagsProp);
        assert.strictEqual(tagsProp!.type, 'List<dynamic>');

        const metaProp = props.find((p: ModelProperty) => p.name === 'metadata');
        assert.ok(metaProp);
        assert.strictEqual(metaProp!.type, 'Map<String, dynamic>');
    });

    test('parseJsonToModel returns default fields for empty or invalid JSON', () => {
        const emptyModel = parseJsonToModel('Product', '');
        assert.strictEqual(emptyModel.properties.length, 2);
        assert.strictEqual(emptyModel.properties[0].name, 'id');
        assert.strictEqual(emptyModel.properties[0].type, 'int');
        assert.strictEqual(emptyModel.properties[1].name, 'title');
        assert.strictEqual(emptyModel.properties[1].type, 'String');

        const invalidModel = parseJsonToModel('Product', '{invalid json}');
        assert.strictEqual(invalidModel.properties.length, 2);
        assert.strictEqual(invalidModel.properties[0].name, 'id');
        assert.strictEqual(invalidModel.properties[1].name, 'title');
    });

    // 5. getPackageName
    test('getPackageName extracts name from pubspec.yaml if present, or returns default', () => {
        // Test default case first
        const defaultName = getPackageName('/non/existent/path');
        assert.strictEqual(defaultName, 'flutter_project');

        // Test with mocked file in temp directory
        const tempDirPath = path.join(__dirname, 'temp_test_project');
        if (!fs.existsSync(tempDirPath)) {
            fs.mkdirSync(tempDirPath, { recursive: true });
        }
        
        fs.writeFileSync(
            path.join(tempDirPath, 'pubspec.yaml'),
            'name: my_test_app\ndescription: A test application\n'
        );

        try {
            const parsedName = getPackageName(tempDirPath);
            assert.strictEqual(parsedName, 'my_test_app');
        } finally {
            // Cleanup
            if (fs.existsSync(path.join(tempDirPath, 'pubspec.yaml'))) {
                fs.unlinkSync(path.join(tempDirPath, 'pubspec.yaml'));
            }
            fs.rmdirSync(tempDirPath);
        }
    });

    // 6. isInjectableEnabled
    test('isInjectableEnabled detects injectable package in pubspec.yaml', () => {
        const tempDirPath = path.join(__dirname, 'temp_test_project_injectable');
        if (!fs.existsSync(tempDirPath)) {
            fs.mkdirSync(tempDirPath, { recursive: true });
        }

        // Case 1: no pubspec
        assert.strictEqual(isInjectableEnabled(tempDirPath), false);

        // Case 2: pubspec without injectable
        fs.writeFileSync(path.join(tempDirPath, 'pubspec.yaml'), 'name: my_test_app\ndependencies:\n  dio: ^5.0.0\n');
        assert.strictEqual(isInjectableEnabled(tempDirPath), false);

        // Case 3: pubspec with injectable
        fs.writeFileSync(path.join(tempDirPath, 'pubspec.yaml'), 'name: my_test_app\ndependencies:\n  dio: ^5.0.0\n  injectable: ^2.0.0\n');
        assert.strictEqual(isInjectableEnabled(tempDirPath), true);

        // Cleanup
        fs.unlinkSync(path.join(tempDirPath, 'pubspec.yaml'));
        fs.rmdirSync(tempDirPath);
    });

    // 7. findProjectRoot
    test('findProjectRoot traverses up to find directory with pubspec.yaml', () => {
        const tempDirPath = path.join(__dirname, 'temp_test_root');
        const subDir = path.join(tempDirPath, 'lib', 'features', 'product');
        if (!fs.existsSync(subDir)) {
            fs.mkdirSync(subDir, { recursive: true });
        }

        // Case 1: no pubspec, should fallback/reach root (or return startDir)
        assert.ok(findProjectRoot(subDir));

        // Case 2: pubspec in temp_test_root
        fs.writeFileSync(path.join(tempDirPath, 'pubspec.yaml'), 'name: my_test_app\n');
        assert.strictEqual(findProjectRoot(subDir), tempDirPath);

        // Cleanup
        fs.unlinkSync(path.join(tempDirPath, 'pubspec.yaml'));
        fs.rmSync(tempDirPath, { recursive: true });
    });

    test('getArchitectureLintRules returns Clean Architecture rules', () => {
        const rules = getArchitectureLintRules('Clean Architecture (Feature-First)');
        assert.ok(rules.includes('prefer_relative_imports: true'));
        assert.ok(rules.includes('avoid_relative_lib_imports: true'));
        assert.ok(rules.includes('# Clean Architecture (Feature-First)'));
    });

    test('getArchitectureLintRules returns MVVM rules', () => {
        const rules = getArchitectureLintRules('MVVM (Model-View-ViewModel)');
        assert.ok(rules.includes('sort_constructors_first: true'));
        assert.ok(rules.includes('# MVVM (Model-View-ViewModel)'));
    });

    test('getArchitectureLintRules returns MVC rules', () => {
        const rules = getArchitectureLintRules('MVC (Model-View-Controller)');
        assert.ok(rules.includes('# MVC (Model-View-Controller)'));
        assert.ok(rules.includes('prefer_relative_imports: true'));
    });

    test('getStateManagementLintRules returns BLoC rules', () => {
        const rules = getStateManagementLintRules('BLoC');
        assert.ok(rules.includes('cancel_subscriptions: true'));
        assert.ok(rules.includes('close_sinks: true'));
    });

    test('getStateManagementLintRules returns Provider rules', () => {
        const rules = getStateManagementLintRules('Provider');
        assert.ok(rules.includes('use_key_in_widget_constructors: true'));
    });

    test('generateAnalysisOptions writes analysis_options.yaml', () => {
        const tempDirPath = path.join(__dirname, 'temp_lint_test');
        fs.mkdirSync(tempDirPath, { recursive: true });

        generateAnalysisOptions(tempDirPath, 'Clean Architecture (Feature-First)', 'Riverpod');

        const analysisPath = path.join(tempDirPath, 'analysis_options.yaml');
        assert.ok(fs.existsSync(analysisPath));
        const content = fs.readFileSync(analysisPath, 'utf8');
        assert.ok(content.includes('include: package:flutter_lints/flutter.yaml'));
        assert.ok(!content.includes('- custom_lint'));
        assert.ok(content.includes('Architecture: Clean Architecture (Feature-First)'));
        assert.ok(content.includes('State Management: Riverpod'));

        fs.rmSync(tempDirPath, { recursive: true });
    });

    test('generateAnalysisOptions does not write duplicate lint rule keys', () => {
        const tempDirPath = path.join(__dirname, 'temp_lint_duplicate_test');
        fs.mkdirSync(tempDirPath, { recursive: true });

        generateAnalysisOptions(tempDirPath, 'MVVM (Model-View-ViewModel)', 'Riverpod');

        const content = fs.readFileSync(path.join(tempDirPath, 'analysis_options.yaml'), 'utf8');
        const ruleNames = content
            .split('\n')
            .map((line) => line.match(/^\s*([a-zA-Z][a-zA-Z0-9_]*):\s*(true|false)$/)?.[1])
            .filter((ruleName): ruleName is string => Boolean(ruleName));
        const duplicateRules = ruleNames.filter((ruleName, index) => ruleNames.indexOf(ruleName) !== index);
        const bareRules = content
            .split('\n')
            .filter((line) => /^\s{4}[a-zA-Z][a-zA-Z0-9_]*\s*$/.test(line));

        assert.deepStrictEqual(duplicateRules, []);
        assert.deepStrictEqual(bareRules, []);

        fs.rmSync(tempDirPath, { recursive: true });
    });

    test('generateAnalysisOptions preserves existing analysis options and merges lint rules', () => {
        const tempDirPath = path.join(__dirname, 'temp_lint_merge_test');
        fs.mkdirSync(tempDirPath, { recursive: true });
        fs.writeFileSync(
            path.join(tempDirPath, 'analysis_options.yaml'),
            [
                'analyzer:',
                '  errors:',
                '    invalid_annotation_target: ignore',
                '',
                'linter:',
                '  rules:',
                '    prefer_const_constructors: false',
                ''
            ].join('\n')
        );

        generateAnalysisOptions(tempDirPath, 'MVVM (Model-View-ViewModel)', 'Riverpod');

        const content = fs.readFileSync(path.join(tempDirPath, 'analysis_options.yaml'), 'utf8');
        assert.ok(content.includes('invalid_annotation_target: ignore'));
        assert.ok(!content.includes('- custom_lint'));
        assert.ok(content.includes('prefer_const_constructors: false'));
        assert.ok(content.includes('# >>> Flutter Config lint rules'));
        assert.ok(content.includes('Architecture: MVVM (Model-View-ViewModel)'));

        const preferConstMatches = content.match(/prefer_const_constructors:/g) || [];
        assert.strictEqual(preferConstMatches.length, 1);

        fs.rmSync(tempDirPath, { recursive: true });
    });

    test('generateAnalysisOptions removes incompatible custom_lint analyzer plugin', () => {
        const tempDirPath = path.join(__dirname, 'temp_lint_plugin_cleanup_test');
        fs.mkdirSync(tempDirPath, { recursive: true });
        fs.writeFileSync(
            path.join(tempDirPath, 'analysis_options.yaml'),
            [
                'analyzer:',
                '  plugins:',
                '    - custom_lint',
                '  errors:',
                '    invalid_annotation_target: ignore',
                '',
                'linter:',
                '  rules:',
                '    prefer_const_constructors: false',
                ''
            ].join('\n')
        );

        generateAnalysisOptions(tempDirPath, 'MVVM (Model-View-ViewModel)', 'Riverpod');

        const content = fs.readFileSync(path.join(tempDirPath, 'analysis_options.yaml'), 'utf8');
        assert.ok(!content.includes('- custom_lint'));
        assert.ok(!content.includes('plugins:\n  errors:'));
        assert.ok(content.includes('invalid_annotation_target: ignore'));
        assert.ok(content.includes('prefer_const_constructors: false'));

        fs.rmSync(tempDirPath, { recursive: true });
    });

    test('generateAnalysisOptions removes legacy Flutter Config lint sections before merging', () => {
        const tempDirPath = path.join(__dirname, 'temp_lint_legacy_merge_test');
        fs.mkdirSync(tempDirPath, { recursive: true });
        fs.writeFileSync(
            path.join(tempDirPath, 'analysis_options.yaml'),
            [
                'include: package:flutter_lints/flutter.yaml',
                '',
                'linter:',
                '  rules:',
                '    # --- Architecture: Clean Architecture (Feature-First) ---',
                '    # Clean Architecture (Feature-First)',
                '    prefer_relative_imports: true',
                '    avoid_relative_lib_imports: true',
                '    implementation_imports: false',
                '    directives_ordering: true',
                '',
                '    # --- State Management: BLoC ---',
                '    # BLoC state management',
                '    avoid_print: true',
                '    cancel_subscriptions: true',
                '    close_sinks: true',
                ''
            ].join('\n')
        );

        generateAnalysisOptions(tempDirPath, 'MVVM (Model-View-ViewModel)', 'Riverpod');

        const content = fs.readFileSync(path.join(tempDirPath, 'analysis_options.yaml'), 'utf8');
        assert.ok(!content.includes('# --- Architecture: Clean Architecture (Feature-First) ---'));
        assert.ok(!content.includes('# --- State Management: BLoC ---'));
        assert.ok(content.includes('# >>> Flutter Config lint rules'));
        assert.ok(content.includes('Architecture: MVVM (Model-View-ViewModel)'));
        assert.ok(content.includes('State Management: Riverpod'));

        const ruleNames = content
            .split('\n')
            .map((line) => line.match(/^\s*([a-zA-Z][a-zA-Z0-9_]*):\s*(true|false)$/)?.[1])
            .filter((ruleName): ruleName is string => Boolean(ruleName));
        const duplicateRules = ruleNames.filter((ruleName, index) => ruleNames.indexOf(ruleName) !== index);

        assert.deepStrictEqual(duplicateRules, []);

        fs.rmSync(tempDirPath, { recursive: true });
    });

    test('generateAnalysisOptions removes unindented legacy Flutter Config lint sections', () => {
        const tempDirPath = path.join(__dirname, 'temp_lint_unindented_legacy_merge_test');
        fs.mkdirSync(tempDirPath, { recursive: true });
        fs.writeFileSync(
            path.join(tempDirPath, 'analysis_options.yaml'),
            [
                'include: package:flutter_lints/flutter.yaml',
                '',
                'linter:',
                '  rules:',
                '# --- Architecture: Clean Architecture (Feature-First) ---',
                '# Clean Architecture (Feature-First)',
                '# Expected structure: lib/features/<feature>/{data,domain,presentation}/',
                '# Keep domain layer free of Flutter imports; depend on abstractions, not implementations.',
                'prefer_relative_imports: true',
                'avoid_relative_lib_imports: true',
                'depend_on_referenced_packages: true',
                'implementation_imports: false',
                'directives_ordering: true',
                '',
                '# --- State Management: BLoC ---',
                '# BLoC state management',
                '# Keep events, states, and blocs in presentation/bloc/ (Clean) or viewmodels/ (MVVM).',
                '# Recommended: add bloc_lint via custom_lint for stricter BLoC-specific checks.',
                'avoid_print: true',
                'cancel_subscriptions: true',
                'close_sinks: true',
                'prefer_final_fields: true',
                ''
            ].join('\n')
        );

        generateAnalysisOptions(tempDirPath, 'MVVM (Model-View-ViewModel)', 'Riverpod');

        const content = fs.readFileSync(path.join(tempDirPath, 'analysis_options.yaml'), 'utf8');
        assert.ok(!content.includes('# --- Architecture: Clean Architecture (Feature-First) ---'));
        assert.ok(!content.includes('# --- State Management: BLoC ---'));
        assert.ok(content.includes('# >>> Flutter Config lint rules'));
        assert.ok(content.includes('Architecture: MVVM (Model-View-ViewModel)'));
        assert.ok(content.includes('State Management: Riverpod'));

        const ruleNames = content
            .split('\n')
            .map((line) => line.match(/^\s*([a-zA-Z][a-zA-Z0-9_]*):\s*(true|false)$/)?.[1])
            .filter((ruleName): ruleName is string => Boolean(ruleName));
        const duplicateRules = ruleNames.filter((ruleName, index) => ruleNames.indexOf(ruleName) !== index);

        assert.deepStrictEqual(duplicateRules, []);

        fs.rmSync(tempDirPath, { recursive: true });
    });

    test('generateAnalysisOptions removes malformed unindented managed lint blocks', () => {
        const tempDirPath = path.join(__dirname, 'temp_lint_malformed_managed_block_test');
        fs.mkdirSync(tempDirPath, { recursive: true });
        fs.writeFileSync(
            path.join(tempDirPath, 'analysis_options.yaml'),
            [
                'include: package:flutter_lints/flutter.yaml',
                '',
                'linter:',
                '  rules:',
                '# --- Architecture: Clean Architecture (Feature-First) ---',
                '# Clean Architecture (Feature-First)',
                'prefer_relative_imports: true',
                'avoid_relative_lib_imports: true',
                'depend_on_referenced_packages: true',
                'implementation_imports: false',
                'directives_ordering: true',
                '',
                '# --- State Management: BLoC ---',
                '# BLoC state management',
                'avoid_print: true',
                'cancel_subscriptions: true',
                'close_sinks: true',
                'prefer_final_fields: true',
                '# <<< Flutter Config lint rules',
                '# >>> Flutter Config lint rules',
                '# Architecture: Clean Architecture (Feature-First)',
                '# State Management: BLoC',
                '',
                'always_declare_return_types',
                'avoid_empty_else',
                'avoid_unnecessary_containers',
                'prefer_const_constructors',
                'prefer_const_declarations',
                'prefer_final_fields',
                'prefer_final_locals',
                'require_trailing_commas',
                'sort_child_properties_last',
                'use_key_in_widget_constructors',
                ''
            ].join('\n')
        );

        generateAnalysisOptions(tempDirPath, 'MVC (Model-View-Controller)', 'Provider');

        const content = fs.readFileSync(path.join(tempDirPath, 'analysis_options.yaml'), 'utf8');
        assert.ok(!content.includes('# --- Architecture: Clean Architecture (Feature-First) ---'));
        assert.ok(!content.includes('# --- State Management: BLoC ---'));
        assert.ok(!content.includes('always_declare_return_types\n'));
        assert.ok(content.includes('# >>> Flutter Config lint rules'));
        assert.ok(content.includes('Architecture: MVC (Model-View-Controller)'));
        assert.ok(content.includes('State Management: Provider'));

        const ruleNames = content
            .split('\n')
            .map((line) => line.match(/^\s*([a-zA-Z][a-zA-Z0-9_]*):\s*(true|false)$/)?.[1])
            .filter((ruleName): ruleName is string => Boolean(ruleName));
        const duplicateRules = ruleNames.filter((ruleName, index) => ruleNames.indexOf(ruleName) !== index);

        assert.deepStrictEqual(duplicateRules, []);

        fs.rmSync(tempDirPath, { recursive: true });
    });

    test('generateAnalysisOptions supports every architecture and state-management combination', () => {
        const tempDirPath = path.join(__dirname, 'temp_lint_all_combinations_test');
        fs.mkdirSync(tempDirPath, { recursive: true });

        try {
            for (const architecture of ARCHITECTURE_OPTIONS) {
                for (const stateManagement of STATE_MANAGEMENT_OPTIONS) {
                    fs.rmSync(path.join(tempDirPath, 'analysis_options.yaml'), { force: true });

                    generateAnalysisOptions(tempDirPath, architecture, stateManagement);

                    const content = fs.readFileSync(path.join(tempDirPath, 'analysis_options.yaml'), 'utf8');
                    assert.ok(content.includes('include: package:flutter_lints/flutter.yaml'));
                    assert.ok(content.includes(`Architecture: ${architecture}`));
                    assert.ok(content.includes(`State Management: ${stateManagement}`));
                    assert.ok(content.includes('# >>> Flutter Config lint rules'));
                    assert.ok(content.includes('# <<< Flutter Config lint rules'));

                    const ruleNames = content
                        .split('\n')
                        .map((line) => line.match(/^\s*([a-zA-Z][a-zA-Z0-9_]*):\s*(true|false)$/)?.[1])
                        .filter((ruleName): ruleName is string => Boolean(ruleName));
                    const duplicateRules = ruleNames.filter((ruleName, index) => ruleNames.indexOf(ruleName) !== index);
                    const bareRules = content
                        .split('\n')
                        .filter((line) => /^\s{4}[a-zA-Z][a-zA-Z0-9_]*\s*$/.test(line));

                    assert.deepStrictEqual(
                        duplicateRules,
                        [],
                        `${architecture} + ${stateManagement} should not generate duplicate rules`
                    );
                    assert.deepStrictEqual(
                        bareRules,
                        [],
                        `${architecture} + ${stateManagement} should not generate bare rule names`
                    );
                }
            }
        } finally {
            fs.rmSync(tempDirPath, { recursive: true });
        }
    });

    test('generateAnalysisOptions replaces previous Flutter Config block across every combination', () => {
        const tempDirPath = path.join(__dirname, 'temp_lint_all_replacements_test');
        fs.mkdirSync(tempDirPath, { recursive: true });

        try {
            for (const firstArchitecture of ARCHITECTURE_OPTIONS) {
                for (const firstStateManagement of STATE_MANAGEMENT_OPTIONS) {
                    for (const nextArchitecture of ARCHITECTURE_OPTIONS) {
                        for (const nextStateManagement of STATE_MANAGEMENT_OPTIONS) {
                            fs.rmSync(path.join(tempDirPath, 'analysis_options.yaml'), { force: true });

                            generateAnalysisOptions(tempDirPath, firstArchitecture, firstStateManagement);
                            generateAnalysisOptions(tempDirPath, nextArchitecture, nextStateManagement);

                            const content = fs.readFileSync(path.join(tempDirPath, 'analysis_options.yaml'), 'utf8');
                            assert.ok(content.includes(`Architecture: ${nextArchitecture}`));
                            assert.ok(content.includes(`State Management: ${nextStateManagement}`));

                            const managedBlockCount = content.match(/# >>> Flutter Config lint rules/g) || [];
                            assert.strictEqual(
                                managedBlockCount.length,
                                1,
                                `${firstArchitecture} + ${firstStateManagement} to ${nextArchitecture} + ${nextStateManagement} should keep one managed block`
                            );

                            const ruleNames = content
                                .split('\n')
                                .map((line) => line.match(/^\s*([a-zA-Z][a-zA-Z0-9_]*):\s*(true|false)$/)?.[1])
                                .filter((ruleName): ruleName is string => Boolean(ruleName));
                            const duplicateRules = ruleNames.filter((ruleName, index) => ruleNames.indexOf(ruleName) !== index);

                            assert.deepStrictEqual(
                                duplicateRules,
                                [],
                                `${firstArchitecture} + ${firstStateManagement} to ${nextArchitecture} + ${nextStateManagement} should not duplicate rules`
                            );
                        }
                    }
                }
            }
        } finally {
            fs.rmSync(tempDirPath, { recursive: true });
        }
    });

    test('generateAnalysisOptions cleans legacy Flutter Config sections for every combination', () => {
        const tempDirPath = path.join(__dirname, 'temp_lint_all_legacy_cleanup_test');
        fs.mkdirSync(tempDirPath, { recursive: true });

        try {
            for (const oldArchitecture of ARCHITECTURE_OPTIONS) {
                for (const oldStateManagement of STATE_MANAGEMENT_OPTIONS) {
                    for (const nextArchitecture of ARCHITECTURE_OPTIONS) {
                        for (const nextStateManagement of STATE_MANAGEMENT_OPTIONS) {
                            fs.writeFileSync(
                                path.join(tempDirPath, 'analysis_options.yaml'),
                                [
                                    'include: package:flutter_lints/flutter.yaml',
                                    '',
                                    'linter:',
                                    '  rules:',
                                    '    # --- Shared Flutter best practices ---',
                                    '    prefer_const_constructors: true',
                                    '    prefer_final_fields: true',
                                    '',
                                    `    # --- Architecture: ${oldArchitecture} ---`,
                                    getArchitectureLintRules(oldArchitecture),
                                    '',
                                    `    # --- State Management: ${oldStateManagement} ---`,
                                    getStateManagementLintRules(oldStateManagement),
                                    ''
                                ].join('\n')
                            );

                            generateAnalysisOptions(tempDirPath, nextArchitecture, nextStateManagement);

                            const content = fs.readFileSync(path.join(tempDirPath, 'analysis_options.yaml'), 'utf8');
                            assert.ok(!content.includes('# --- Shared Flutter best practices ---'));
                            assert.ok(!content.includes(`# --- Architecture: ${oldArchitecture} ---`));
                            assert.ok(!content.includes(`# --- State Management: ${oldStateManagement} ---`));
                            assert.ok(content.includes(`Architecture: ${nextArchitecture}`));
                            assert.ok(content.includes(`State Management: ${nextStateManagement}`));

                            const ruleNames = content
                                .split('\n')
                                .map((line) => line.match(/^\s*([a-zA-Z][a-zA-Z0-9_]*):\s*(true|false)$/)?.[1])
                                .filter((ruleName): ruleName is string => Boolean(ruleName));
                            const duplicateRules = ruleNames.filter((ruleName, index) => ruleNames.indexOf(ruleName) !== index);

                            assert.deepStrictEqual(
                                duplicateRules,
                                [],
                                `${oldArchitecture} + ${oldStateManagement} legacy to ${nextArchitecture} + ${nextStateManagement} should not duplicate rules`
                            );
                        }
                    }
                }
            }
        } finally {
            fs.rmSync(tempDirPath, { recursive: true });
        }
    });

    test('configurePubspecForLints adds flutter_lints to dev_dependencies', () => {
        const tempDirPath = path.join(__dirname, 'temp_pubspec_lint_test');
        fs.mkdirSync(tempDirPath, { recursive: true });
        fs.writeFileSync(
            path.join(tempDirPath, 'pubspec.yaml'),
            'name: test_app\ndev_dependencies:\n  flutter_test:\n    sdk: flutter\n'
        );

        const added = configurePubspecForLints(tempDirPath);
        assert.strictEqual(added, true);

        const content = fs.readFileSync(path.join(tempDirPath, 'pubspec.yaml'), 'utf8');
        assert.ok(content.includes('flutter_lints: ^6.0.0'));
        assert.ok(!content.includes('custom_lint:'));
        assert.ok(!content.includes('clean_arch_lint:'));
        assert.ok(!content.includes('clean_architecture_lints:'));

        fs.rmSync(tempDirPath, { recursive: true });
    });

    test('configurePubspecForLints creates dev_dependencies when missing', () => {
        const tempDirPath = path.join(__dirname, 'temp_pubspec_lint_no_devdeps_test');
        fs.mkdirSync(tempDirPath, { recursive: true });
        fs.writeFileSync(
            path.join(tempDirPath, 'pubspec.yaml'),
            'name: test_app\ndependencies:\n  flutter:\n    sdk: flutter\n'
        );

        const added = configurePubspecForLints(tempDirPath);
        assert.strictEqual(added, true);

        const content = fs.readFileSync(path.join(tempDirPath, 'pubspec.yaml'), 'utf8');
        assert.ok(content.includes('dev_dependencies:\n  flutter_lints: ^6.0.0'));
        assert.ok(!content.includes('custom_lint:'));
        assert.ok(!content.includes('clean_arch_lint:'));
        assert.ok(!content.includes('clean_architecture_lints:'));

        fs.rmSync(tempDirPath, { recursive: true });
    });

    test('configurePubspecForLints removes incompatible custom lint packages', () => {
        const tempDirPath = path.join(__dirname, 'temp_pubspec_lint_conflict_cleanup_test');
        fs.mkdirSync(tempDirPath, { recursive: true });
        fs.writeFileSync(
            path.join(tempDirPath, 'pubspec.yaml'),
            [
                'name: test_app',
                'dev_dependencies:',
                '  flutter_lints: ^6.0.0',
                '  custom_lint: ^0.8.1',
                '  clean_arch_lint: ^1.1.0',
                '  clean_architecture_lints: ^1.1.0',
                ''
            ].join('\n')
        );

        const changed = configurePubspecForLints(tempDirPath);
        assert.strictEqual(changed, true);

        const content = fs.readFileSync(path.join(tempDirPath, 'pubspec.yaml'), 'utf8');
        assert.ok(content.includes('flutter_lints: ^6.0.0'));
        assert.ok(!content.includes('custom_lint:'));
        assert.ok(!content.includes('clean_arch_lint:'));
        assert.ok(!content.includes('clean_architecture_lints:'));

        fs.rmSync(tempDirPath, { recursive: true });
    });

    test('generateMethodChannelDartFile creates a Dart wrapper', () => {
        const tempDirPath = path.join(__dirname, 'temp_method_channel_dart_test');
        fs.mkdirSync(tempDirPath, { recursive: true });

        generateMethodChannelDartFile(
            tempDirPath,
            'battery_info',
            'BatteryInfo',
            'getBatteryLevel',
            'test_app/battery_info'
        );

        const content = fs.readFileSync(
            path.join(tempDirPath, 'lib', 'core', 'platform', 'battery_info_channel.dart'),
            'utf8'
        );
        assert.ok(content.includes("MethodChannel('test_app/battery_info')"));
        assert.ok(content.includes('static Future<dynamic> getBatteryLevel()'));

        fs.rmSync(tempDirPath, { recursive: true });
    });

    test('configureAndroidMethodChannel wires Kotlin MainActivity', () => {
        const tempDirPath = path.join(__dirname, 'temp_method_channel_kotlin_test');
        const androidDir = path.join(tempDirPath, 'android', 'app', 'src', 'main', 'kotlin', 'com', 'example', 'app');
        fs.mkdirSync(androidDir, { recursive: true });
        fs.writeFileSync(
            path.join(androidDir, 'MainActivity.kt'),
            [
                'package com.example.app',
                '',
                'import io.flutter.embedding.android.FlutterActivity',
                '',
                'class MainActivity: FlutterActivity() {',
                '}',
                ''
            ].join('\n')
        );

        const wired = configureAndroidMethodChannel(tempDirPath, 'BatteryInfo', 'getBatteryLevel', 'test_app/battery_info');
        assert.strictEqual(wired, true);

        const content = fs.readFileSync(path.join(androidDir, 'MainActivity.kt'), 'utf8');
        assert.ok(content.includes('import io.flutter.embedding.engine.FlutterEngine'));
        assert.ok(content.includes('import io.flutter.plugin.common.MethodChannel'));
        assert.ok(content.includes('override fun configureFlutterEngine'));
        assert.ok(content.includes('"test_app/battery_info"'));
        assert.ok(content.includes('"getBatteryLevel"'));

        fs.rmSync(tempDirPath, { recursive: true });
    });

    test('configureAndroidMethodChannel wires Java MainActivity', () => {
        const tempDirPath = path.join(__dirname, 'temp_method_channel_java_test');
        const androidDir = path.join(tempDirPath, 'android', 'app', 'src', 'main', 'java', 'com', 'example', 'app');
        fs.mkdirSync(androidDir, { recursive: true });
        fs.writeFileSync(
            path.join(androidDir, 'MainActivity.java'),
            [
                'package com.example.app;',
                '',
                'import io.flutter.embedding.android.FlutterActivity;',
                '',
                'public class MainActivity extends FlutterActivity {',
                '}',
                ''
            ].join('\n')
        );

        const wired = configureAndroidMethodChannel(tempDirPath, 'BatteryInfo', 'getBatteryLevel', 'test_app/battery_info');
        assert.strictEqual(wired, true);

        const content = fs.readFileSync(path.join(androidDir, 'MainActivity.java'), 'utf8');
        assert.ok(content.includes('import io.flutter.embedding.engine.FlutterEngine;'));
        assert.ok(content.includes('import io.flutter.plugin.common.MethodChannel;'));
        assert.ok(content.includes('public void configureFlutterEngine'));
        assert.ok(content.includes('"test_app/battery_info"'));
        assert.ok(content.includes('"getBatteryLevel"'));

        fs.rmSync(tempDirPath, { recursive: true });
    });

    test('configureIosMethodChannel wires AppDelegate.swift', () => {
        const tempDirPath = path.join(__dirname, 'temp_method_channel_ios_test');
        const iosDir = path.join(tempDirPath, 'ios', 'Runner');
        fs.mkdirSync(iosDir, { recursive: true });
        fs.writeFileSync(
            path.join(iosDir, 'AppDelegate.swift'),
            [
                'import Flutter',
                'import UIKit',
                '',
                '@main',
                '@objc class AppDelegate: FlutterAppDelegate {',
                '  override func application(',
                '    _ application: UIApplication,',
                '    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?',
                '  ) -> Bool {',
                '    GeneratedPluginRegistrant.register(with: self)',
                '    return super.application(application, didFinishLaunchingWithOptions: launchOptions)',
                '  }',
                '}',
                ''
            ].join('\n')
        );

        const wired = configureIosMethodChannel(tempDirPath, 'getBatteryLevel', 'test_app/battery_info');
        assert.strictEqual(wired, true);

        const content = fs.readFileSync(path.join(iosDir, 'AppDelegate.swift'), 'utf8');
        assert.ok(content.includes('FlutterMethodChannel(name: "test_app/battery_info"'));
        assert.ok(content.includes('case "getBatteryLevel":'));

        fs.rmSync(tempDirPath, { recursive: true });
    });
});
