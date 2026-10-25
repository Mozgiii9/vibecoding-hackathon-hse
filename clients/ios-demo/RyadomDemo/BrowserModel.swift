import SwiftUI
import WebKit

/// Owns one persistent WebKit session throughout foreground/background transitions.
@MainActor
final class BrowserModel: NSObject, ObservableObject, WKNavigationDelegate, WKUIDelegate {
    @Published var loading = true
    @Published var failure: String?
    @Published var externalURL: URL?

    let webView: WKWebView
    let configuration: AppConfiguration
    private let policy: NavigationPolicy

    init(configuration: AppConfiguration) {
        self.configuration = configuration
        policy = NavigationPolicy(appURL: configuration.appURL)
        let webConfiguration = WKWebViewConfiguration()
        webConfiguration.websiteDataStore = .default()
        webConfiguration.preferences.javaScriptCanOpenWindowsAutomatically = false
        webView = WKWebView(frame: .zero, configuration: webConfiguration)
        super.init()
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.isOpaque = false
        webView.backgroundColor = UIColor(red: 0.12, green: 0.11, blue: 0.10, alpha: 1)
        webView.scrollView.backgroundColor = webView.backgroundColor
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.keyboardDismissMode = .interactive
        webView.allowsBackForwardNavigationGestures = true
        loadHome()
    }

    /// Retries with a GET of the entry page, never replaying a submitted import.
    func loadHome() {
        failure = nil
        loading = true
        webView.load(URLRequest(url: configuration.appURL, timeoutInterval: 30))
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        loading = true
        failure = nil
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        loading = false
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        show(error: error)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        show(error: error)
    }

    private func show(error: Error) {
        let code = (error as NSError).code
        if (error as NSError).domain == NSURLErrorDomain, code == NSURLErrorCancelled { return }
        loading = false
        switch code {
        case NSURLErrorNotConnectedToInternet, NSURLErrorNetworkConnectionLost:
            failure = "Нет подключения к сети. Проверьте Wi-Fi или мобильный интернет и повторите загрузку."
        case NSURLErrorTimedOut:
            failure = "Сервер не ответил вовремя. Повторите загрузку через несколько секунд."
        case NSURLErrorSecureConnectionFailed, NSURLErrorServerCertificateUntrusted,
             NSURLErrorServerCertificateHasBadDate, NSURLErrorServerCertificateHasUnknownRoot,
             NSURLErrorServerCertificateNotYetValid:
            failure = "Не удалось проверить защищённое соединение. Проверьте HTTPS-сертификат сервера и дату на iPhone."
        default:
            failure = "Не удалось открыть приложение. Проверьте доступность сервера и повторите загрузку."
        }
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        loading = false
        failure = "iOS завершила веб-экран. Откройте его снова; незавершённый ввод мог не сохраниться."
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }
        let userInitiated = navigationAction.navigationType == .linkActivated
        let decision = policy.decision(for: url, userInitiated: userInitiated)
        switch decision {
        case .embedded:
            if navigationAction.targetFrame == nil {
                decisionHandler(.cancel)
                webView.load(navigationAction.request)
            } else {
                decisionHandler(.allow)
            }
        case .askToOpenExternally:
            decisionHandler(.cancel)
            if navigationAction.targetFrame?.isMainFrame != false { externalURL = url }
        case .blocked:
            decisionHandler(.cancel)
            if navigationAction.targetFrame?.isMainFrame != false {
                loading = false
                failure = "Переход заблокирован: приложение принимает только свой HTTPS-адрес. Внешние ссылки открываются после нажатия и подтверждения."
            }
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse,
                 decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        if navigationResponse.isForMainFrame,
           let response = navigationResponse.response as? HTTPURLResponse,
           response.statusCode >= 400 {
            decisionHandler(.cancel)
            loading = false
            failure = "Сервер вернул ошибку HTTP \(response.statusCode). Повторите загрузку или сообщите команде."
        } else {
            decisionHandler(.allow)
        }
    }

    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin,
                 initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType,
                 decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        // The current shared UI uploads files; native recording is outside this demo.
        decisionHandler(.deny)
    }
}
