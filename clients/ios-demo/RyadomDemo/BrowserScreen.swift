import SwiftUI
import WebKit

struct BrowserScreen: View {
    @StateObject private var model: BrowserModel
    @State private var externalOpenFailed = false
    @Environment(\.openURL) private var openURL

    init(configuration: AppConfiguration) {
        _model = StateObject(wrappedValue: BrowserModel(configuration: configuration))
    }

    var body: some View {
        ZStack(alignment: .top) {
            Color(red: 0.12, green: 0.11, blue: 0.10)
                .ignoresSafeArea(.container)
            WebContainer(webView: model.webView)
                .accessibilityLabel("Рядом — веб-приложение")
            if model.loading {
                HStack(spacing: 12) {
                    ProgressView()
                    Text("Открываем Рядом…")
                }
                .padding(12)
                .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
                .padding()
                .accessibilityElement(children: .combine)
            }
            if let failure = model.failure {
                VStack(spacing: 16) {
                    Image(systemName: "wifi.exclamationmark").font(.largeTitle)
                    Text("Не удалось загрузить").font(.title2.bold())
                    Text(failure).multilineTextAlignment(.center)
                    Button("Повторить загрузку") { model.loadHome() }
                        .buttonStyle(.borderedProminent)
                }
                .padding(24)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color(red: 0.12, green: 0.11, blue: 0.10))
            }
        }
        .foregroundStyle(.white)
        .preferredColorScheme(.dark)
        .confirmationDialog("Открыть внешнюю ссылку?", isPresented: Binding(
            get: { model.externalURL != nil },
            set: { if !$0 { model.externalURL = nil } }
        ), titleVisibility: .visible, presenting: model.externalURL) { url in
            Button("Открыть") {
                openURL(url) { accepted in externalOpenFailed = !accepted }
                model.externalURL = nil
            }
            Button("Отмена", role: .cancel) { model.externalURL = nil }
        } message: { url in
            Text(url.absoluteString)
        }
        .alert("Не удалось открыть ссылку", isPresented: $externalOpenFailed) {
            Button("Понятно", role: .cancel) {}
        } message: {
            Text("На устройстве нет доступного приложения для этой ссылки.")
        }
    }
}

private struct WebContainer: UIViewRepresentable {
    let webView: WKWebView

    func makeUIView(context: Context) -> WKWebView { webView }
    func updateUIView(_ uiView: WKWebView, context: Context) {}
}
