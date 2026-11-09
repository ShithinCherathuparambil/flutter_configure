import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:test_project/core/di/injection.dart';
import '../../domain/entities/task_entity.dart';
import '../bloc/task_bloc.dart';

class TaskPage extends StatelessWidget {
  static const route = '/task';
  const TaskPage({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (context) => getIt<TaskBloc>()..add(LoadTasksEvent()),
      child: const TaskView(),
    );
  }
}

class TaskView extends StatefulWidget {
  const TaskView({super.key});

  @override
  State<TaskView> createState() => _TaskViewState();
}

class _TaskViewState extends State<TaskView> {
  final TextEditingController _searchController = TextEditingController();

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _showTaskFormDialog(BuildContext context, {TaskEntity? existingTask}) {
    final formKey = GlobalKey<FormState>();
    final titleController = TextEditingController(text: existingTask?.task_title ?? '');
    final descController = TextEditingController(text: existingTask?.description ?? '');
    String selectedDueDate = existingTask?.due_date ?? '';
    String selectedPriority = existingTask?.priority ?? 'Medium';
    String selectedStatus = existingTask?.status ?? 'Pending';

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Theme.of(context).colorScheme.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (bottomSheetContext) {
        return StatefulBuilder(
          builder: (context, setModalState) {
            return Padding(
              padding: EdgeInsets.only(
                left: 20,
                right: 20,
                top: 24,
                bottom: MediaQuery.of(bottomSheetContext).viewInsets.bottom + 24,
              ),
              child: SingleChildScrollView(
                child: Form(
                  key: formKey,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            existingTask == null ? 'Add New Task' : 'Edit Task',
                            style: Theme.of(context).textTheme.titleLarge?.copyWith(
                                  fontWeight: FontWeight.bold,
                                ),
                          ),
                          IconButton(
                            icon: const Icon(Icons.close),
                            onPressed: () => Navigator.pop(bottomSheetContext),
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),
                      TextFormField(
                        controller: titleController,
                        decoration: const InputDecoration(
                          labelText: 'Task Title *',
                          hintText: 'Enter title...',
                          border: OutlineInputBorder(),
                          prefixIcon: Icon(Icons.title),
                        ),
                        validator: (value) {
                          if (value == null || value.trim().isEmpty) {
                            return 'Task title is mandatory';
                          }
                          return null;
                        },
                      ),
                      const SizedBox(height: 14),
                      TextFormField(
                        controller: descController,
                        maxLines: 2,
                        decoration: const InputDecoration(
                          labelText: 'Description (Optional)',
                          hintText: 'Add description...',
                          border: OutlineInputBorder(),
                          prefixIcon: Icon(Icons.description_outlined),
                        ),
                      ),
                      const SizedBox(height: 14),
                      InkWell(
                        onTap: () async {
                          final now = DateTime.now();
                          final picked = await showDatePicker(
                            context: context,
                            initialDate: now,
                            firstDate: DateTime(2020),
                            lastDate: DateTime(2035),
                          );
                          if (picked != null) {
                            final formatted =
                                '${picked.year.toString().padLeft(4, '0')}-${picked.month.toString().padLeft(2, '0')}-${picked.day.toString().padLeft(2, '0')}';
                            setModalState(() {
                              selectedDueDate = formatted;
                            });
                          }
                        },
                        child: InputDecorator(
                          decoration: InputDecoration(
                            labelText: 'Due Date *',
                            border: const OutlineInputBorder(),
                            prefixIcon: const Icon(Icons.calendar_today_outlined),
                            errorText: selectedDueDate.isEmpty ? 'Due date is mandatory' : null,
                          ),
                          child: Text(
                            selectedDueDate.isEmpty ? 'Tap to select due date' : selectedDueDate,
                            style: TextStyle(
                              color: selectedDueDate.isEmpty
                                  ? Theme.of(context).hintColor
                                  : Theme.of(context).textTheme.bodyMedium?.color,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(height: 14),
                      Row(
                        children: [
                          Expanded(
                            child: DropdownButtonFormField<String>(
                              value: selectedPriority,
                              decoration: const InputDecoration(
                                labelText: 'Priority',
                                border: OutlineInputBorder(),
                                prefixIcon: Icon(Icons.flag_outlined),
                              ),
                              items: const [
                                DropdownMenuItem(value: 'Low', child: Text('Low')),
                                DropdownMenuItem(value: 'Medium', child: Text('Medium')),
                                DropdownMenuItem(value: 'High', child: Text('High')),
                              ],
                              onChanged: (val) {
                                if (val != null) {
                                  setModalState(() => selectedPriority = val);
                                }
                              },
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: DropdownButtonFormField<String>(
                              value: selectedStatus,
                              decoration: const InputDecoration(
                                labelText: 'Status',
                                border: OutlineInputBorder(),
                                prefixIcon: Icon(Icons.check_circle_outline),
                              ),
                              items: const [
                                DropdownMenuItem(value: 'Pending', child: Text('Pending')),
                                DropdownMenuItem(value: 'Completed', child: Text('Completed')),
                              ],
                              onChanged: (val) {
                                if (val != null) {
                                  setModalState(() => selectedStatus = val);
                                }
                              },
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 20),
                      SizedBox(
                        width: double.infinity,
                        height: 48,
                        child: ElevatedButton.icon(
                          icon: Icon(existingTask == null ? Icons.add : Icons.save),
                          label: Text(existingTask == null ? 'Create Task' : 'Save Changes'),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: Theme.of(context).colorScheme.primary,
                            foregroundColor: Theme.of(context).colorScheme.onPrimary,
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(10),
                            ),
                          ),
                          onPressed: () {
                            if (!formKey.currentState!.validate()) return;
                            if (selectedDueDate.isEmpty) {
                              setModalState(() {});
                              return;
                            }

                            final taskBloc = context.read<TaskBloc>();
                            if (existingTask == null) {
                              final newTask = TaskEntity(
                                id: DateTime.now().millisecondsSinceEpoch.toString(),
                                task_title: titleController.text.trim(),
                                description: descController.text.trim(),
                                due_date: selectedDueDate,
                                priority: selectedPriority,
                                status: selectedStatus,
                                created_date: DateTime.now().toIso8601String(),
                              );
                              taskBloc.add(AddTaskEvent(newTask));
                            } else {
                              final updatedTask = existingTask.copyWith(
                                task_title: titleController.text.trim(),
                                description: descController.text.trim(),
                                due_date: selectedDueDate,
                                priority: selectedPriority,
                                status: selectedStatus,
                              );
                              taskBloc.add(UpdateTaskEvent(updatedTask));
                            }

                            Navigator.pop(bottomSheetContext);
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content: Text(
                                  existingTask == null ? 'Task created!' : 'Task updated!',
                                ),
                                duration: const Duration(seconds: 2),
                              ),
                            );
                          },
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            );
          },
        );
      },
    );
  }

  Color _getPriorityColor(String priority) {
    switch (priority.toLowerCase()) {
      case 'high':
        return Colors.red.shade700;
      case 'medium':
        return Colors.amber.shade800;
      case 'low':
      default:
        return Colors.green.shade700;
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Offline Task Manager', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
            Row(
              children: [
                Icon(Icons.cloud_off, size: 14, color: theme.colorScheme.onSurfaceVariant),
                const SizedBox(width: 4),
                Text(
                  'Hive Local Storage (100% Offline)',
                  style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                ),
              ],
            ),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _showTaskFormDialog(context),
        icon: const Icon(Icons.add),
        label: const Text('Add Task'),
      ),
      body: BlocConsumer<TaskBloc, TaskState>(
        listener: (context, state) {
          if (state is TaskError) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text(state.message), backgroundColor: Colors.red),
            );
          }
        },
        builder: (context, state) {
          if (state is TaskLoading) {
            return const Center(child: CircularProgressIndicator());
          }

          if (state is TaskLoaded) {
            return Column(
              children: [
                // Search Bar
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  child: TextField(
                    controller: _searchController,
                    decoration: InputDecoration(
                      hintText: 'Search tasks by title or description...',
                      prefixIcon: const Icon(Icons.search),
                      suffixIcon: _searchController.text.isNotEmpty
                          ? IconButton(
                              icon: const Icon(Icons.clear),
                              onPressed: () {
                                _searchController.clear();
                                context.read<TaskBloc>().add(FilterTasksEvent(searchQuery: ''));
                              },
                            )
                          : null,
                      filled: true,
                      fillColor: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.4),
                      contentPadding: const EdgeInsets.symmetric(vertical: 0, horizontal: 16),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: BorderSide.none,
                      ),
                    ),
                    onChanged: (query) {
                      context.read<TaskBloc>().add(FilterTasksEvent(searchQuery: query));
                    },
                  ),
                ),

                // Filters Section
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Status Filters
                      Row(
                        children: [
                          const Text('Status: ', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                          const SizedBox(width: 6),
                          Wrap(
                            spacing: 6,
                            children: ['All', 'Pending', 'Completed'].map((status) {
                              final isSelected = state.statusFilter.toLowerCase() == status.toLowerCase();
                              return ChoiceChip(
                                label: Text(status),
                                selected: isSelected,
                                onSelected: (sel) {
                                  if (sel) {
                                    context.read<TaskBloc>().add(FilterTasksEvent(statusFilter: status));
                                  }
                                },
                              );
                            }).toList(),
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      // Priority Filters
                      Row(
                        children: [
                          const Text('Priority: ', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                          const SizedBox(width: 6),
                          Wrap(
                            spacing: 6,
                            children: ['All', 'Low', 'Medium', 'High'].map((prio) {
                              final isSelected = state.priorityFilter.toLowerCase() == prio.toLowerCase();
                              return ChoiceChip(
                                label: Text(prio),
                                selected: isSelected,
                                onSelected: (sel) {
                                  if (sel) {
                                    context.read<TaskBloc>().add(FilterTasksEvent(priorityFilter: prio));
                                  }
                                },
                              );
                            }).toList(),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                const Divider(),

                // Task List or Empty State
                Expanded(
                  child: state.filteredTasks.isEmpty
                      ? Center(
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(
                                Icons.assignment_outlined,
                                size: 64,
                                color: theme.colorScheme.outline,
                              ),
                              const SizedBox(height: 12),
                              Text(
                                state.allTasks.isEmpty
                                    ? 'No tasks yet!'
                                    : 'No tasks match current filter',
                                style: theme.textTheme.titleMedium?.copyWith(
                                  color: theme.colorScheme.onSurfaceVariant,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                state.allTasks.isEmpty
                                    ? 'Tap the + button to create a new offline task.'
                                    : 'Try resetting the filters or search.',
                                style: theme.textTheme.bodySmall?.copyWith(
                                  color: theme.colorScheme.outline,
                                ),
                              ),
                            ],
                          ),
                        )
                      : ListView.separated(
                          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                          itemCount: state.filteredTasks.length,
                          separatorBuilder: (_, __) => const SizedBox(height: 8),
                          itemBuilder: (context, index) {
                            final task = state.filteredTasks[index];
                            final isCompleted = task.isCompleted;

                            return Dismissible(
                              key: Key(task.id),
                              direction: DismissDirection.endToStart,
                              background: Container(
                                alignment: Alignment.centerRight,
                                padding: const EdgeInsets.only(right: 20),
                                decoration: BoxDecoration(
                                  color: Colors.red.shade600,
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                child: const Icon(Icons.delete, color: Colors.white),
                              ),
                              confirmDismiss: (_) async {
                                return await showDialog<bool>(
                                  context: context,
                                  builder: (ctx) => AlertDialog(
                                    title: const Text('Delete Task'),
                                    content: Text('Are you sure you want to delete "${task.task_title}"?'),
                                    actions: [
                                      TextButton(
                                        onPressed: () => Navigator.pop(ctx, false),
                                        child: const Text('Cancel'),
                                      ),
                                      TextButton(
                                        onPressed: () => Navigator.pop(ctx, true),
                                        style: TextButton.styleFrom(foregroundColor: Colors.red),
                                        child: const Text('Delete'),
                                      ),
                                    ],
                                  ),
                                );
                              },
                              onDismissed: (_) {
                                context.read<TaskBloc>().add(DeleteTaskEvent(task.id));
                                ScaffoldMessenger.of(context).showSnackBar(
                                  SnackBar(
                                    content: Text('Task "${task.task_title}" deleted'),
                                    duration: const Duration(seconds: 2),
                                  ),
                                );
                              },
                              child: Card(
                                elevation: isCompleted ? 0 : 2,
                                color: isCompleted
                                    ? theme.colorScheme.surfaceContainerLow
                                    : theme.colorScheme.surface,
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(12),
                                  side: BorderSide(
                                    color: isCompleted
                                        ? theme.colorScheme.outlineVariant
                                        : Colors.transparent,
                                  ),
                                ),
                                child: InkWell(
                                  borderRadius: BorderRadius.circular(12),
                                  onTap: () => _showTaskFormDialog(context, existingTask: task),
                                  child: Padding(
                                    padding: const EdgeInsets.all(12),
                                    child: Row(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        // Toggle completion checkbox
                                        IconButton(
                                          icon: Icon(
                                            isCompleted
                                                ? Icons.check_circle
                                                : Icons.radio_button_unchecked,
                                            color: isCompleted
                                                ? Colors.green.shade600
                                                : theme.colorScheme.outline,
                                          ),
                                          onPressed: () {
                                            context.read<TaskBloc>().add(ToggleTaskStatusEvent(task));
                                          },
                                        ),
                                        const SizedBox(width: 4),

                                        // Task details
                                        Expanded(
                                          child: Column(
                                            crossAxisAlignment: CrossAxisAlignment.start,
                                            children: [
                                              Text(
                                                task.task_title,
                                                style: theme.textTheme.titleMedium?.copyWith(
                                                  fontWeight: FontWeight.bold,
                                                  decoration: isCompleted
                                                      ? TextDecoration.lineThrough
                                                      : TextDecoration.none,
                                                  color: isCompleted
                                                      ? theme.colorScheme.outline
                                                      : theme.colorScheme.onSurface,
                                                ),
                                              ),
                                              if (task.description.isNotEmpty) ...[
                                                const SizedBox(height: 4),
                                                Text(
                                                  task.description,
                                                  maxLines: 2,
                                                  overflow: TextOverflow.ellipsis,
                                                  style: theme.textTheme.bodyMedium?.copyWith(
                                                    color: isCompleted
                                                        ? theme.colorScheme.outline
                                                        : theme.colorScheme.onSurfaceVariant,
                                                  ),
                                                ),
                                              ],
                                              const SizedBox(height: 8),

                                              // Badges Row
                                              Wrap(
                                                spacing: 8,
                                                runSpacing: 4,
                                                children: [
                                                  // Due Date Badge
                                                  Container(
                                                    padding: const EdgeInsets.symmetric(
                                                        horizontal: 8, vertical: 3),
                                                    decoration: BoxDecoration(
                                                      color: theme.colorScheme.surfaceContainerHighest,
                                                      borderRadius: BorderRadius.circular(6),
                                                    ),
                                                    child: Row(
                                                      mainAxisSize: MainAxisSize.min,
                                                      children: [
                                                        Icon(Icons.calendar_today,
                                                            size: 12,
                                                            color: theme.colorScheme.onSurfaceVariant),
                                                        const SizedBox(width: 4),
                                                        Text(
                                                          'Due: ${task.due_date}',
                                                          style: theme.textTheme.labelSmall?.copyWith(
                                                            color: theme.colorScheme.onSurfaceVariant,
                                                          ),
                                                        ),
                                                      ],
                                                    ),
                                                  ),

                                                  // Priority Badge
                                                  Container(
                                                    padding: const EdgeInsets.symmetric(
                                                        horizontal: 8, vertical: 3),
                                                    decoration: BoxDecoration(
                                                      color: _getPriorityColor(task.priority)
                                                          .withValues(alpha: 0.15),
                                                      borderRadius: BorderRadius.circular(6),
                                                      border: Border.all(
                                                        color: _getPriorityColor(task.priority),
                                                        width: 1,
                                                      ),
                                                    ),
                                                    child: Text(
                                                      task.priority,
                                                      style: theme.textTheme.labelSmall?.copyWith(
                                                        color: _getPriorityColor(task.priority),
                                                        fontWeight: FontWeight.bold,
                                                      ),
                                                    ),
                                                  ),

                                                  // Status Badge
                                                  Container(
                                                    padding: const EdgeInsets.symmetric(
                                                        horizontal: 8, vertical: 3),
                                                    decoration: BoxDecoration(
                                                      color: isCompleted
                                                          ? Colors.green.withValues(alpha: 0.15)
                                                          : Colors.blue.withValues(alpha: 0.15),
                                                      borderRadius: BorderRadius.circular(6),
                                                    ),
                                                    child: Text(
                                                      task.status,
                                                      style: theme.textTheme.labelSmall?.copyWith(
                                                        color: isCompleted
                                                            ? Colors.green.shade700
                                                            : Colors.blue.shade700,
                                                        fontWeight: FontWeight.bold,
                                                      ),
                                                    ),
                                                  ),
                                                ],
                                              ),
                                            ],
                                          ),
                                        ),

                                        // Actions Menu
                                        PopupMenuButton<String>(
                                          icon: const Icon(Icons.more_vert, size: 20),
                                          onSelected: (val) {
                                            if (val == 'edit') {
                                              _showTaskFormDialog(context, existingTask: task);
                                            } else if (val == 'toggle') {
                                              context.read<TaskBloc>().add(ToggleTaskStatusEvent(task));
                                            } else if (val == 'delete') {
                                              context.read<TaskBloc>().add(DeleteTaskEvent(task.id));
                                              ScaffoldMessenger.of(context).showSnackBar(
                                                SnackBar(
                                                  content: Text('Task "${task.task_title}" deleted'),
                                                  duration: const Duration(seconds: 2),
                                                ),
                                              );
                                            }
                                          },
                                          itemBuilder: (ctx) => [
                                            PopupMenuItem(
                                              value: 'edit',
                                              child: Row(
                                                children: const [
                                                  Icon(Icons.edit_outlined, size: 18),
                                                  SizedBox(width: 8),
                                                  Text('Edit'),
                                                ],
                                              ),
                                            ),
                                            PopupMenuItem(
                                              value: 'toggle',
                                              child: Row(
                                                children: [
                                                  Icon(
                                                    isCompleted
                                                        ? Icons.replay
                                                        : Icons.check_circle_outline,
                                                    size: 18,
                                                  ),
                                                  const SizedBox(width: 8),
                                                  Text(isCompleted
                                                      ? 'Mark as Pending'
                                                      : 'Mark as Completed'),
                                                ],
                                              ),
                                            ),
                                            const PopupMenuDivider(),
                                            PopupMenuItem(
                                              value: 'delete',
                                              child: Row(
                                                children: const [
                                                  Icon(Icons.delete_outline, color: Colors.red, size: 18),
                                                  SizedBox(width: 8),
                                                  Text('Delete', style: TextStyle(color: Colors.red)),
                                                ],
                                              ),
                                            ),
                                          ],
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                              ),
                            );
                          },
                        ),
                ),
              ],
            );
          }

          return const SizedBox();
        },
      ),
    );
  }
}
