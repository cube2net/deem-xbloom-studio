# Recipe encoding corrections

The former 18 g validation was an application restriction. The dosing cup is specified as 30 g; Omni Dripper's recommended 5–18 g dose is a separate dripper recommendation. Deem now accepts integer recipe doses from 1–30 g and retains the source dose. An Omni recipe above 18 g displays its dripper recommendation without silently reducing the dose.

- Official specifications: https://tbdxsupport.zendesk.com/hc/en-us/articles/25198204646939-Getting-started
- BLE reference and captures, firmware V12.0D.500: https://github.com/brAzzi64/xbloom-ble/blob/main/PROTOCOL.md
- Reference encoder: https://github.com/brAzzi64/xbloom-ble/blob/main/python/xbloom.py

Each BLE substep contains volume, temperature, pattern, and vibration as separate bytes. Pattern codes are center=0, circular/ring=1, spiral=2. Vibration is independent of the pattern: bit 0 enables vibration before the pour; bit 1 enables vibration after it. Thus none/before/after/both encode as 0/1/2/3. Center pouring no longer enables vibration implicitly. Grinder RPM is global and only occupies the first pour's timing block, even when that first pour is centered.

The public xBloom cloud uses different pattern numbers: 1=center, 2=spiral, 3=circular. This was cross-checked against the actual shared recipe corresponding to Rashf `xbc-1010175`: dose 20 g, first pour before+after vibration, followed by two circular pours. The regression fixture preserves that recipe. Cloud enum values must not be copied directly into the BLE pattern byte.

Tests check the dose frame, every pattern/vibration combination, first-pour RPM, CRC, ratio, and the reported recipe's exact payload. Tests do not establish hardware compatibility with an untested firmware. Loading and starting remain separate explicit actions.

## Grinder RPM resolution

The recipe encoder writes RPM directly as an integer byte, not as an index into seven speed presets. Accept every integer from 60 through 120. The xBloom Japan specification states that RPM is configurable in RPM units: https://xbloom.jp/pages/%E3%82%B9%E3%83%9A%E3%83%83%E3%82%AF . The public CAF recipe `recipe-1793735016122` supplies RPM 83; the regression fixture preserves this without rounding. Manual-mode dial increments must not constrain imported recipe bytes.
