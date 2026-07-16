import 'package:dio/dio.dart';
import 'package:injectable/injectable.dart';

@module
abstract class DioModule {
  @lazySingleton
  Dio get dio {
    final dio = Dio(
      BaseOptions(
        baseUrl: 'https://api.yourdomain.com/v1/', // അടിസ്ഥാന URL
        connectTimeout: const Duration(seconds: 10),
        receiveTimeout: const Duration(seconds: 10),
      ),
    );

    // ഇന്റർസെപ്റ്റർ ഇവിടെ ചേർക്കുന്നു
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          // API കോൾ പോകുന്നതിന് മുൻപ് ടോക്കൺ ആഡ് ചെയ്യുന്നു
          String token =
              "your_oauth2_token_here"; // ഷെയർഡ് പ്രിഫറൻസിൽ നിന്നോ മറ്റോ എടുക്കാം
          options.headers['Authorization'] = 'Bearer $token';

          print('API Request: ${options.method} ${options.path}');
          return handler.next(options); // കോൾ മുന്നോട്ട് പോകാൻ അനുവദിക്കുന്നു
        },
        onError: (DioException e, handler) {
          // ടോക്കൺ കാലാവധി കഴിഞ്ഞാൽ (401) ലോഗൗട്ട് ചെയ്യാനുള്ള ലോജിക് ഇവിടെ എഴുതാം
          print('API Error: ${e.response?.statusCode}');
          return handler.next(e);
        },
      ),
    );

    return dio;
  }
}
