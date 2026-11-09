import 'package:freezed_annotation/freezed_annotation.dart';
import '../../domain/entities/task_entity.dart';

part 'task_model.freezed.dart';
part 'task_model.g.dart';

@freezed
abstract class TaskModel with _$TaskModel {
  @JsonSerializable(explicitToJson: true)
  const factory TaskModel({
    required String id,
    @JsonKey(name: 'task_title') required String taskTitle,
    required String description,
    @JsonKey(name: 'due_date') required String dueDate,
    required String priority,
    required String status,
    @JsonKey(name: 'created_date') required String createdDate,
  }) = _TaskModel;

  factory TaskModel.fromJson(Map<String, dynamic> json) => _$TaskModelFromJson(json);

  factory TaskModel.fromEntity(TaskEntity entity) => TaskModel(
    id: entity.id,
    taskTitle: entity.task_title,
    description: entity.description,
    dueDate: entity.due_date,
    priority: entity.priority,
    status: entity.status,
    createdDate: entity.created_date,
  );

  const TaskModel._();

  TaskEntity toEntity() => TaskEntity(
      id: id,
      task_title: taskTitle,
      description: description,
      due_date: dueDate,
      priority: priority,
      status: status,
      created_date: createdDate,
  );
}

extension TaskEntityToModel on TaskEntity {
  TaskModel toModel() => TaskModel.fromEntity(this);
}

