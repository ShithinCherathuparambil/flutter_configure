const Module = require('module');
const originalRequire = Module.prototype.require;

const mockVscode = {
    window: {
        showInformationMessage: () => Promise.resolve(),
        showErrorMessage: () => Promise.resolve(),
        showWarningMessage: () => Promise.resolve(),
        showQuickPick: () => Promise.resolve(),
        showInputBox: () => Promise.resolve(),
        withProgress: (opts, task) => task({ report: () => {} }),
    },
    commands: {
        registerCommand: () => ({ dispose: () => {} }),
        executeCommand: () => Promise.resolve(),
    },
    workspace: {
        workspaceFolders: [],
        getConfiguration: () => ({
            get: () => '',
            update: () => Promise.resolve(),
        }),
    },
    ProgressLocation: {
        Notification: 15,
    },
    Uri: {
        file: (f) => ({ fsPath: f }),
    },
    Position: class { constructor(line, char) { this.line = line; this.character = char; } },
    Range: class { constructor(start, end) { this.start = start; this.end = end; } },
};

Module.prototype.require = function(id) {
    if (id === 'vscode') {
        return mockVscode;
    }
    return originalRequire.apply(this, arguments);
};
