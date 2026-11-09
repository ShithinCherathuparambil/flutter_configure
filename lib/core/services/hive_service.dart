import 'package:flutter/foundation.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:injectable/injectable.dart';

@lazySingleton
class HiveService {
  static final HiveService _instance = HiveService._internal();
  factory HiveService() => _instance;
  HiveService._internal();

  static const String defaultBoxName = 'app_preferences';

  Box? _defaultBox;

  Box get defaultBox {
    if (_defaultBox == null || !_defaultBox!.isOpen) {
      if (Hive.isBoxOpen(defaultBoxName)) {
        _defaultBox = Hive.box(defaultBoxName);
        return _defaultBox!;
      }
      throw StateError(
        'HiveService default box is not initialized. Call HiveService().init() first.',
      );
    }
    return _defaultBox!;
  }

  Future<void> init({String boxName = defaultBoxName}) async {
    await Hive.initFlutter();
    _defaultBox = await openBox(boxName);
  }

  Future<Box<T>> openBox<T>(String boxName) async {
    if (Hive.isBoxOpen(boxName)) {
      return Hive.box<T>(boxName);
    }
    return await Hive.openBox<T>(boxName);
  }

  Box<T> getBox<T>([String? boxName]) {
    final name = boxName ?? defaultBoxName;
    if (!Hive.isBoxOpen(name)) {
      throw StateError('Box "$name" is not open. Call openBox("$name") first.');
    }
    return Hive.box<T>(name);
  }

  bool isBoxOpen(String boxName) => Hive.isBoxOpen(boxName);

  void registerAdapter<T>(TypeAdapter<T> adapter) {
    if (!Hive.isAdapterRegistered(adapter.typeId)) {
      Hive.registerAdapter<T>(adapter);
    }
  }

  Future<void> put<T>(dynamic key, T value, {String? boxName}) async {
    final box = boxName != null ? await openBox(boxName) : defaultBox;
    await box.put(key, value);
  }

  T? get<T>(dynamic key, {T? defaultValue, String? boxName}) {
    final box = boxName != null ? getBox(boxName) : defaultBox;
    return box.get(key, defaultValue: defaultValue) as T?;
  }

  Future<void> delete(dynamic key, {String? boxName}) async {
    final box = boxName != null ? await openBox(boxName) : defaultBox;
    await box.delete(key);
  }

  bool containsKey(dynamic key, {String? boxName}) {
    final box = boxName != null ? getBox(boxName) : defaultBox;
    return box.containsKey(key);
  }

  List<T> getAll<T>({String? boxName}) {
    final box = boxName != null ? getBox(boxName) : defaultBox;
    return box.values.cast<T>().toList();
  }

  Map<dynamic, dynamic> toMap({String? boxName}) {
    final box = boxName != null ? getBox(boxName) : defaultBox;
    return box.toMap();
  }

  Future<void> clear({String? boxName}) async {
    final box = boxName != null ? await openBox(boxName) : defaultBox;
    await box.clear();
  }

  Future<void> closeBox(String boxName) async {
    if (Hive.isBoxOpen(boxName)) {
      await Hive.box(boxName).close();
    }
  }

  Future<void> closeAll() async {
    await Hive.close();
  }

  ValueListenable<Box<T>> listenable<T>({String? boxName, List<dynamic>? keys}) {
    final box = getBox<T>(boxName ?? defaultBoxName);
    return box.listenable(keys: keys);
  }
}

