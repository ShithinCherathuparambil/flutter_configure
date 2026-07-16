# Flutter Config

Standardized architecture and boilerplate code generator for Flutter applications. Instantly configure Clean Architecture or MVVM and generate feature layers for BLoC or Riverpod.

## Features

- **Initialize Architecture**: Prompts and installs required dependencies (`dio`, `get_it`, `injectable`, `freezed`, `flutter_bloc`/`flutter_riverpod`), and sets up core network configurations.
- **Generate Feature/Screen Stack**: Automatically generates matching data models, remote data sources, repositories, use cases, viewmodels/blocs, and UI pages.
- **Auto Code-Gen Integration**: Automatically runs `build_runner` after generation to create Freezed classes and Injectable configurations.
- **Explorer Sidebar Context Menu**: Create features/screens directly by right-clicking a folder in the VS Code sidebar.

---

## How to Use

### 1. Initialize Architecture
1. Open the Command Palette (`Cmd+Shift+P` on macOS or `Ctrl+Shift+P` on Windows/Linux).
2. Type and select: **`Flutter Config: Initialize Architecture`**.
3. Choose your architecture style:
   - **Clean Architecture (Feature-First)**
   - **MVVM (Model-View-ViewModel)**
4. Choose your preferred state management:
   - **BLoC**
   - **Riverpod**

This will automatically add dependencies to `pubspec.yaml` and construct the `lib/core/` directory containing configured DI (`lib/core/di/injection.dart`) and Dio modules (`lib/core/network/dio_configuration.dart`).

### 2. Create a New Screen
1. In the Explorer sidebar, **right-click** on any folder (e.g. `lib/features` or a specific feature subdirectory).
2. Choose **`Flutter Config: Create New Screen`**.
3. Input the screen/feature name (e.g., `ProductDetail`).
4. Choose whether to paste a JSON payload to generate data models automatically.
5. The extension will generate all target directories, code-gen configurations, and file templates automatically (including GET, POST, PUT, and DELETE methods), then invoke `build_runner` in the background.

### 3. Generate API Action from Widget Callback
1. Open any UI page/view file (e.g. `banner_details_page.dart` or `login_page.dart`).
2. Position your cursor on a line with a widget callback function (e.g. `onPressed: () {`, `onTap: () {`, `onChanged: ...`).
3. Press **`Cmd+.`** (macOS) or **`Ctrl+.`** (Windows) to show the Quick Fix lightbulb, or right-click and select **`Flutter Config: Generate API Action from Callback`**.
4. Prompt inputs:
   - **Action Name**: e.g., `updateProfile` or `deleteBanner`.
   - **HTTP Method**: Choose `GET`, `POST`, `PUT`, or `DELETE`.
   - **API Endpoint**: e.g., `/profile/update`.
5. The extension will automatically:
   - Generate and append the remote data source call using `dio_extensions.dart`.
   - Append repository contract and implementation methods.
   - Create a dedicated use case (e.g. `UpdateProfileUseCase`) and register it in the dependency injection container.
   - Wire the event/notifier handler in your state management layer (BLoC/Riverpod).
   - Automatically insert the execution trigger (e.g. `context.read<BannerBloc>().add(ExecuteDeleteBannerEvent());` or `ref.read(bannerNotifierProvider.notifier).deleteBanner();`) directly at your cursor's position inside the callback!

---

## HTTP Methods & CRUD Support

When initializing the architecture, a `dio_extensions.dart` helper file is created in `lib/core/network/`. The generated features automatically utilize these extension methods for robust and typed API calls:

### Using the Dio Extensions
You can use the helper methods directly on your `Dio` client instance:
```dart
// GET request
final response = await dio.getRequest('/products');

// POST / Push request
final response = await dio.postRequest('/products', data: productJson);

// PUT / Update request
final response = await dio.putRequest('/products/1', data: updatedJson);

// DELETE request
final response = await dio.deleteRequest('/products/1');
```

### Generated CRUD Layers (Clean Architecture)
When generating a new feature, the extension automatically sets up:
- **Remote Data Source:** Implements `fetch`, `create`, `update`, and `delete` methods calling the corresponding Dio extension.
- **Repository & Impl:** Passes data from remote source and maps model items to UI Entities.
- **Use Cases:** Generates four separate use case files (`Get...UseCase`, `Create...UseCase`, `Update...UseCase`, `Delete...UseCase`) which are auto-registered in your dependency injection locator.
- **BLoC/Riverpod:** Automatically injects all four use cases so you can perform read, create, update, and delete actions directly from your state managers.

---

## Local Extension Installation / Development

To rebuild and test the extension locally:
1. Open the `flutter_config` directory in a terminal.
2. Compile changes:
   ```bash
   npm run compile
   ```
3. To package the extension as a `.vsix` file:
   ```bash
   npx vsce package
   ```
4. Install the generated `.vsix` package in VS Code:
   - Run command: `Developer: Install Extension from VSIX...` from the command palette and select the compiled `.vsix` file.
