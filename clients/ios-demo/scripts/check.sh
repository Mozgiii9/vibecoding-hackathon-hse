#!/bin/sh
# Compile and run pure URL/navigation checks without device signing or dependencies.
set -eu
cd "$(dirname "$0")/.."
mkdir -p build/module-cache
SDK_PATH=$(xcrun --sdk macosx --show-sdk-path)
xcrun swiftc -sdk "$SDK_PATH" -module-cache-path build/module-cache \
  RyadomDemo/AppConfiguration.swift Tests/ConfigurationChecks.swift \
  -o build/ConfigurationChecks
build/ConfigurationChecks
plutil -lint RyadomDemo/Info.plist RyadomDemo.xcodeproj/project.pbxproj
