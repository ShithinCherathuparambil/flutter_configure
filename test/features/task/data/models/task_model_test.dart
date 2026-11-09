import 'package:flutter_test/flutter_test.dart';
import 'package:test_project/features/task/data/models/task_model.dart';
import 'package:test_project/features/task/domain/entities/task_entity.dart';

void main() {
  group('TaskModel', () {
    const jsonSample = {
      'id': '101',
      'task_title': 'Complete Machine Test',
      'description': 'Offline Flutter task with Hive persistence',
      'due_date': '2026-11-01',
      'priority': 'High',
      'status': 'Pending',
      'created_date': '2026-10-31T12:00:00Z',
    };

    test('should correctly deserialize from JSON', () {
      final model = TaskModel.fromJson(jsonSample);

      expect(model.id, '101');
      expect(model.taskTitle, 'Complete Machine Test');
      expect(model.description, 'Offline Flutter task with Hive persistence');
      expect(model.dueDate, '2026-11-01');
      expect(model.priority, 'High');
      expect(model.status, 'Pending');
      expect(model.createdDate, '2026-10-31T12:00:00Z');
    });

    test('should correctly serialize to JSON map matching expected keys', () {
      final model = TaskModel.fromJson(jsonSample);
      final json = model.toJson();

      expect(json['id'], '101');
      expect(json['task_title'], 'Complete Machine Test');
      expect(json['due_date'], '2026-11-01');
      expect(json['priority'], 'High');
      expect(json['status'], 'Pending');
    });

    test('should map back and forth between TaskEntity and TaskModel', () {
      const entity = TaskEntity(
        id: '202',
        task_title: 'Entity Test',
        description: 'Test description',
        due_date: '2026-11-05',
        priority: 'Low',
        status: 'Completed',
        created_date: '2026-10-31',
      );

      final model = TaskModel.fromEntity(entity);
      expect(model.id, entity.id);
      expect(model.taskTitle, entity.task_title);
      expect(model.status, entity.status);

      final mappedEntity = model.toEntity();
      expect(mappedEntity.id, entity.id);
      expect(mappedEntity.task_title, entity.task_title);
      expect(mappedEntity.isCompleted, true);
    });
  });
}

