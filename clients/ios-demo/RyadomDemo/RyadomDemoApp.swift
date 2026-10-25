import SwiftUI

@main
struct RyadomDemoApp: App {
    var body: some Scene {
        WindowGroup {
            RootView()
        }
    }
}

struct RootView: View {
    private let configuration = Result {
        try AppConfiguration(rawURL: Bundle.main.object(forInfoDictionaryKey: "RyadomAppURL") as? String ?? "")
    }

    var body: some View {
        switch configuration {
        case .success(let configuration):
            BrowserScreen(configuration: configuration)
        case .failure(let error):
            VStack(spacing: 16) {
                Image(systemName: "gearshape")
                    .font(.largeTitle)
                Text("Нужен адрес приложения")
                    .font(.title2.bold())
                Text(error.localizedDescription)
                    .multilineTextAlignment(.center)
                    .textSelection(.enabled)
            }
            .padding(24)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color(red: 0.12, green: 0.11, blue: 0.10))
            .foregroundStyle(.white)
            .preferredColorScheme(.dark)
        }
    }
}
