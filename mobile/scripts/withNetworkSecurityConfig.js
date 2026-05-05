/**
 * Expo Config Plugin: Inject Android Network Security Config + ISRG Root X1 cert
 *
 * Android 7.0 (API 24) does NOT have ISRG Root X1 in its CA trust store.
 * The DST Root CA X3 cross-sign expired Sept 2024. This means NO Let's Encrypt
 * certificate works on Android 7.0 out of the box.
 *
 * This plugin:
 * 1. Copies the ISRG Root X1 PEM cert into the app's raw resources
 * 2. Creates a network_security_config.xml that trusts system CAs + the bundled ISRG Root X1
 * 3. References the config in AndroidManifest.xml
 */

const { withAndroidManifest } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const NETWORK_SECURITY_CONFIG = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="false">
        <trust-anchors>
            <certificates src="system" />
            <certificates src="@raw/isrgrootx1" />
        </trust-anchors>
    </base-config>
</network-security-config>
`;

const withNetworkSecurityConfig = (config) => {
  return withAndroidManifest(config, async (config) => {
    const projectRoot = config.modRequest.platformProjectRoot;
    
    // Create res/xml directory and write network security config
    const resXmlDir = path.join(projectRoot, 'app', 'src', 'main', 'res', 'xml');
    if (!fs.existsSync(resXmlDir)) {
      fs.mkdirSync(resXmlDir, { recursive: true });
    }
    fs.writeFileSync(
      path.join(resXmlDir, 'network_security_config.xml'),
      NETWORK_SECURITY_CONFIG,
      'utf-8'
    );
    console.log('[withNetworkSecurityConfig] Wrote network_security_config.xml');

    // Create res/raw directory and copy the ISRG Root X1 PEM
    const resRawDir = path.join(projectRoot, 'app', 'src', 'main', 'res', 'raw');
    if (!fs.existsSync(resRawDir)) {
      fs.mkdirSync(resRawDir, { recursive: true });
    }
    
    // Copy the PEM file from our assets
    const sourcePem = path.join(config.modRequest.projectRoot, 'assets', 'isrgrootx1.pem');
    const destPem = path.join(resRawDir, 'isrgrootx1.pem');
    
    if (fs.existsSync(sourcePem)) {
      fs.copyFileSync(sourcePem, destPem);
      console.log('[withNetworkSecurityConfig] Copied ISRG Root X1 cert to res/raw/');
    } else {
      console.error('[withNetworkSecurityConfig] ERROR: isrgrootx1.pem not found at', sourcePem);
    }

    // Set the reference in AndroidManifest.xml
    const application = config.modResults.manifest.application?.[0];
    if (application) {
      application.$['android:networkSecurityConfig'] = '@xml/network_security_config';
      console.log('[withNetworkSecurityConfig] Set android:networkSecurityConfig attribute');
    }

    return config;
  });
};

module.exports = withNetworkSecurityConfig;
