// Signs Android release packages with the owner's upload key (ANDROID-1, decision A04).
// The key and its passwords stay outside the repository: Gradle reads them from the owner's
// ~/.gradle/gradle.properties. A release build without them fails instead of falling back to
// the public debug key, because a package signed with the debug key could never be updated
// by a correctly signed one.
const { withAppBuildGradle } = require('expo/config-plugins');

const k_signingMarker = '// Havensum release signing (ANDROID-1)';
const k_signingConfigsOpening = 'signingConfigs {\n';
const k_buildTypesOpening = 'buildTypes {';
const k_releaseBuildTypeOpening = 'release {';
const k_debugSigningLine = 'signingConfig signingConfigs.debug';
const k_releaseSigningLine = 'signingConfig signingConfigs.release';
const k_releaseSigningConfig = `        ${k_signingMarker}
        release {
            if (findProperty('HAVENSUM_UPLOAD_STORE_FILE')) {
                storeFile file(findProperty('HAVENSUM_UPLOAD_STORE_FILE'))
                storePassword findProperty('HAVENSUM_UPLOAD_STORE_PASSWORD')
                keyAlias findProperty('HAVENSUM_UPLOAD_KEY_ALIAS')
                keyPassword findProperty('HAVENSUM_UPLOAD_KEY_PASSWORD')
            }
        }
`;
const k_missingKeyGuard = `
${k_signingMarker}: refuse to package a release without the owner's upload key.
gradle.taskGraph.whenReady { taskGraph ->
    def releasePackagingTaskNames = ['packageRelease', 'bundleRelease']
    def packagesRelease = taskGraph.allTasks.any { task ->
        task.project == project && releasePackagingTaskNames.contains(task.name)
    }
    def requiredSigningProperties = [
        'HAVENSUM_UPLOAD_STORE_FILE',
        'HAVENSUM_UPLOAD_STORE_PASSWORD',
        'HAVENSUM_UPLOAD_KEY_ALIAS',
        'HAVENSUM_UPLOAD_KEY_PASSWORD'
    ]
    def missingSigningProperties = requiredSigningProperties.findAll { name -> !findProperty(name) }
    if (packagesRelease && !missingSigningProperties.isEmpty()) {
        throw new GradleException("Havensum release builds need the owner's upload key. Missing Gradle properties: \${missingSigningProperties.join(', ')}. See docs/ANDROID_BUILD.md.")
    }
}
`;

function requireIndex(text, fragment, fromIndex, description) {
  const index = text.indexOf(fragment, fromIndex);
  if (index === -1) {
    throw new Error(`withHavensumReleaseSigning: could not find ${description} in android/app/build.gradle. Update the plugin for the new Expo template before building a release.`);
  }
  return index;
}

function addReleaseSigningConfig(appBuildGradle) {
  const signingConfigsIndex = requireIndex(appBuildGradle, k_signingConfigsOpening, 0, 'the signingConfigs block');
  const insertionIndex = signingConfigsIndex + k_signingConfigsOpening.length;
  return appBuildGradle.slice(0, insertionIndex) + k_releaseSigningConfig + appBuildGradle.slice(insertionIndex);
}

function signReleaseBuildTypeWithUploadKey(appBuildGradle) {
  const buildTypesIndex = requireIndex(appBuildGradle, k_buildTypesOpening, 0, 'the buildTypes block');
  const releaseIndex = requireIndex(appBuildGradle, k_releaseBuildTypeOpening, buildTypesIndex, 'the release build type');
  const debugSigningIndex = requireIndex(appBuildGradle, k_debugSigningLine, releaseIndex, 'the release signing line');
  const afterDebugSigningIndex = debugSigningIndex + k_debugSigningLine.length;
  return appBuildGradle.slice(0, debugSigningIndex) + k_releaseSigningLine + appBuildGradle.slice(afterDebugSigningIndex);
}

function applyReleaseSigning(appBuildGradle) {
  if (appBuildGradle.includes(k_signingMarker)) {
    return appBuildGradle;
  }
  const withSigningConfig = addReleaseSigningConfig(appBuildGradle);
  const withSignedRelease = signReleaseBuildTypeWithUploadKey(withSigningConfig);
  return withSignedRelease + k_missingKeyGuard;
}

module.exports = function withHavensumReleaseSigning(config) {
  return withAppBuildGradle(config, (modConfig) => {
    if (modConfig.modResults.language !== 'groovy') {
      throw new Error('withHavensumReleaseSigning: only the Groovy android/app/build.gradle is supported.');
    }
    modConfig.modResults.contents = applyReleaseSigning(modConfig.modResults.contents);
    return modConfig;
  });
};
