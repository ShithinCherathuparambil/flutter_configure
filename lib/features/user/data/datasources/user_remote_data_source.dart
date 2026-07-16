import 'package:dio/dio.dart';
import '../models/user_model.dart';

class UserRemoteDataSource {
  final Dio dio;
  UserRemoteDataSource(this.dio);

  Future<UserModel> fetchUser() async {
    try {
      // Simulate real API call
      await Future.delayed(const Duration(seconds: 2));

      // Dummy JSON data
      final responseData = {
        "id": 1,
        "name": "Senior Flutter Developer",
        "email": "dev@example.com",
      };

      return UserModel.fromJson(responseData);
    } catch (e) {
      throw Exception("Failed to fetch data from API");
    }
  }
}
