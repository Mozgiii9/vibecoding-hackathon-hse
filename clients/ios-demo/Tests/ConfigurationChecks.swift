import Foundation

@main
struct ConfigurationChecks {
    static func main() throws {
        let valid = ["https://demo.example.org/", "https://203.0.113.7/", "https://[2001:db8::1]/app", "https://demo.example.org:8443/app"]
        for value in valid {
            _ = try AppConfiguration(rawURL: value)
        }
        let invalid = ["", "$(RYADOM_APP_URL)", "http://demo.example.org", "https://localhost", "https://app.localhost", "https://127.0.0.1/", "https://[::1]/", "https://0.0.0.0/", "https://user:password@demo.example.org", "https://demo.example.org?token=secret", "https://demo.example.org/#token", "https:///", "https://demo.example.org:0", "https://demo.example.org:65536"]
        let loopbackAliases = ["https://localhost./", "https://[0:0:0:0:0:0:0:1]/", "https://2130706433/", "https://127.1/", "https://0x7f000001/", "https://[::ffff:7f00:1]/"]
        for value in invalid + loopbackAliases {
            do {
                _ = try AppConfiguration(rawURL: value)
                fatalError("Accepted an invalid URL: \(value)")
            } catch ConfigurationError.invalidURL {}
        }
        let policy = NavigationPolicy(appURL: try AppConfiguration(rawURL: "https://demo.example.org/app").appURL)
        let cases: [(String, Bool, NavigationPolicy.Decision)] = [
            ("https://demo.example.org/login", false, .embedded),
            ("https://demo.example.org:443/goals", false, .embedded),
            ("https://demo.example.org:8443", true, .askToOpenExternally),
            ("https://other.example.org/", true, .askToOpenExternally),
            ("https://other.example.org/", false, .blocked),
            ("http://demo.example.org/", true, .blocked),
            ("javascript:alert(1)", true, .blocked),
            ("file:///etc/passwd", true, .blocked),
            ("data:text/html,test", true, .blocked),
            ("mailto:demo@example.org", true, .askToOpenExternally),
            ("tel:+10000000000", true, .askToOpenExternally),
            ("tel:+10000000000", false, .blocked),
            ("https://user:secret@demo.example.org/", true, .blocked)
        ]
        for (value, initiated, expected) in cases {
            precondition(policy.decision(for: URL(string: value)!, userInitiated: initiated) == expected, value)
        }
        print("PASS: \(valid.count + invalid.count + loopbackAliases.count) URL checks and \(cases.count) navigation checks")
    }
}
