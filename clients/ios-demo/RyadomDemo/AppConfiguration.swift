import Foundation
import Darwin

/// Validates the public web entry point without carrying account credentials.
struct AppConfiguration {
    let appURL: URL

    init(rawURL: String) throws {
        let value = rawURL.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty, !value.contains("$("),
              let parts = URLComponents(string: value),
              parts.scheme?.lowercased() == "https",
              let host = parts.host?.lowercased(), !host.isEmpty,
              parts.user == nil, parts.password == nil,
              parts.query == nil, parts.fragment == nil,
              !Self.isLoopback(host),
              parts.port == nil || (1...65535).contains(parts.port!),
              let url = parts.url else {
            throw ConfigurationError.invalidURL
        }
        appURL = url
    }

    private static func isLoopback(_ host: String) -> Bool {
        let normalized = host.trimmingCharacters(in: CharacterSet(charactersIn: "[]"))
            .trimmingCharacters(in: CharacterSet(charactersIn: ".")).lowercased()
        if normalized == "localhost" || normalized.hasSuffix(".localhost") { return true }
        var ipv4 = in_addr()
        if inet_aton(normalized, &ipv4) == 1 {
            let firstByte = ipv4.s_addr.bigEndian >> 24
            return firstByte == 127 || firstByte == 0
        }
        var ipv6 = in6_addr()
        if inet_pton(AF_INET6, normalized, &ipv6) == 1 {
            let bytes = withUnsafeBytes(of: &ipv6) { Array($0) }
            let loopbackOrUnspecified = bytes.prefix(15).allSatisfy { $0 == 0 } && bytes[15] <= 1
            let mappedLoopback = bytes.prefix(10).allSatisfy { $0 == 0 }
                && bytes[10] == 255 && bytes[11] == 255 && (bytes[12] == 127 || bytes[12] == 0)
            return loopbackOrUnspecified || mappedLoopback
        }
        return false
    }
}

enum ConfigurationError: LocalizedError {
    case invalidURL

    var errorDescription: String? {
        "Укажите HTTPS-адрес приложения в Config/Local.xcconfig и пересоберите приложение. Нужен адрес, доступный с iPhone, без логина, пароля и токенов в URL."
    }
}

/// Keeps the authenticated application within its exact HTTPS origin.
struct NavigationPolicy {
    enum Decision: Equatable {
        case embedded
        case askToOpenExternally
        case blocked
    }

    let appURL: URL

    func decision(for url: URL, userInitiated: Bool) -> Decision {
        guard url.user == nil, url.password == nil else { return .blocked }
        let scheme = url.scheme?.lowercased()
        if scheme == "https", url.host?.lowercased() == appURL.host?.lowercased(),
           (url.port ?? 443) == (appURL.port ?? 443) {
            return .embedded
        }
        if userInitiated, ["https", "mailto", "tel"].contains(scheme ?? "") {
            return .askToOpenExternally
        }
        return .blocked
    }
}
