# Lift 0.0.0.0 Binding Ban Design Document

## Overview
Enable `dsh web --host 0.0.0.0` to bind the web server to all network interfaces, supporting VPN and local network access for remote servers.

## Technical Changes
1. **`packages/bundle/web-app/src/startup.ts`**:
   - Remove the check `if (options.host === '0.0.0.0') { program.error(...) }`.
   - Allow `'0.0.0.0'` as a valid bind host, printing a helpful notice if desired.

2. **Tests**:
   - Update `packages/bundle/web-app/tests/startup.spec.ts` to assert success when `--host 0.0.0.0` is passed instead of expecting exit code 1.
   - Update `apps/cli/tests/built-bin.e2e.ts` to expect successful startup on `0.0.0.0`.

## Security Considerations
- Binding to `0.0.0.0` exposes the port on all network interfaces. Users in VPN-restricted setups (like the user's 10.20.10.1/24 and 10.10.11.1/24 VPN subnets) rely on network-level isolation. The API gateway's trust fence (`resolveLanTrust`) protects against DNS rebinding attacks by validating the `Host` header against known LAN/VPN IP addresses and explicit `--trusted-host` rules.
