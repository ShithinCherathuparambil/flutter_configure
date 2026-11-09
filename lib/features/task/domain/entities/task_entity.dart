class TaskEntity {
  final String id;
  final String task_title;
  final String description;
  final String due_date;
  final String priority;
  final String status;
  final String created_date;

  const TaskEntity({
    required this.id,
    required this.task_title,
    required this.description,
    required this.due_date,
    required this.priority,
    required this.status,
    required this.created_date,
  });

  TaskEntity copyWith({
    String? id,
    String? task_title,
    String? description,
    String? due_date,
    String? priority,
    String? status,
    String? created_date,
  }) {
    return TaskEntity(
      id: id ?? this.id,
      task_title: task_title ?? this.task_title,
      description: description ?? this.description,
      due_date: due_date ?? this.due_date,
      priority: priority ?? this.priority,
      status: status ?? this.status,
      created_date: created_date ?? this.created_date,
    );
  }

  bool get isCompleted => status.toLowerCase() == 'completed';
}

