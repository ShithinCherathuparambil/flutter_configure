import 'package:injectable/injectable.dart';
import 'package:dio/dio.dart';
import 'package:test_project/core/network/dio_extensions.dart';
import '../models/task_model.dart';

abstract class TaskRemoteDataSource {
  Future<TaskModel> fetchTaskData();
  Future<TaskModel> createTask(TaskModel model);
  Future<TaskModel> updateTask(TaskModel model);
  Future<TaskModel> patchTask(dynamic id, Map<String, dynamic> data);
  Future<void> deleteTask(dynamic id);
}

@LazySingleton(as: TaskRemoteDataSource)
class TaskRemoteDataSourceImpl implements TaskRemoteDataSource {
  final Dio dio;

  TaskRemoteDataSourceImpl(this.dio);

  @override
  Future<TaskModel> fetchTaskData() async {
    try {
      final response = await dio.getRequest('/task');
      return TaskModel.fromJson(response.data as Map<String, dynamic>);
    } catch (e) {
      throw Exception("Failed to fetch task: $e");
    }
  }

  @override
  Future<TaskModel> createTask(TaskModel model) async {
    try {
      final response = await dio.postRequest('/task', data: model.toJson());
      return TaskModel.fromJson(response.data as Map<String, dynamic>);
    } catch (e) {
      throw Exception("Failed to create task: $e");
    }
  }

  @override
  Future<TaskModel> updateTask(TaskModel model) async {
    try {
      final response = await dio.putRequest('/task', data: model.toJson());
      return TaskModel.fromJson(response.data as Map<String, dynamic>);
    } catch (e) {
      throw Exception("Failed to update task: $e");
    }
  }

  @override
  Future<TaskModel> patchTask(dynamic id, Map<String, dynamic> data) async {
    try {
      final response = await dio.patchRequest('/task/$id', data: data);
      return TaskModel.fromJson(response.data as Map<String, dynamic>);
    } catch (e) {
      throw Exception("Failed to patch task: $e");
    }
  }

  @override
  Future<void> deleteTask(dynamic id) async {
    try {
      await dio.deleteRequest('/task/$id');
    } catch (e) {
      throw Exception("Failed to delete task: $e");
    }
  }
}
