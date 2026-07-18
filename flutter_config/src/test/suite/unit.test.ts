import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import { toSnakeCase, toPascalCase, toCamelCase, parseJsonToModel, getPackageName, ModelProperty } from '../../extension';

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
});
