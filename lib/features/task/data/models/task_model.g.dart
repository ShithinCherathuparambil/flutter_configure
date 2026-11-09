// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'task_model.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_TaskModel _$TaskModelFromJson(Map<String, dynamic> json) => _TaskModel(
  id: json['id'] as String,
  taskTitle: json['task_title'] as String,
  description: json['description'] as String,
  dueDate: json['due_date'] as String,
  priority: json['priority'] as String,
  status: json['status'] as String,
  createdDate: json['created_date'] as String,
);

Map<String, dynamic> _$TaskModelToJson(_TaskModel instance) =>
    <String, dynamic>{
      'id': instance.id,
      'task_title': instance.taskTitle,
      'description': instance.description,
      'due_date': instance.dueDate,
      'priority': instance.priority,
      'status': instance.status,
      'created_date': instance.createdDate,
    };
