# Material-Specific Thermal & Magnetic Saturation Limit Validation

An advanced engineering monitoring feature integrated into the Performance Dashboard and Main KPI bar that dynamically checks stator current density ($J$) and flux densities ($B_{ts}, B_{ys}$) against material-specific thermal/saturation thresholds. Provides interactive material selectors, real-time margin gauges, and synchronized warning color states (Nominal, Caution, Exceeded).

> [!IMPORTANT]
> **Confirmed Architectural Decisions**
> - **Thermal Insulation & Cooling Selection**: Configurable cooling methods (IC411 TEFC Surface Air, IC01 Open Ventilated, IC71W Direct Liquid / Water Jacket) combined with insulation thermal classes (Class B 130°C, Class F 155°C, Class H 180°C), establishing physically accurate current density limits:
>   - Naturally ventilated / IC01: $J_{\text{limit}} \approx 3.5 - 5.0\,\text{A/mm}^2$
>   - TEFC Air-cooled / IC411: $J_{\text{limit}} \approx 5.0 - 7.0\,\text{A/mm}^2$
>   - Liquid jacket / IC71W: $J_{\text{limit}} \approx 8.0 - 15.0\,\text{A/mm}^2$
> - **Lamination Steel Saturation Thresholds**: Selectable electrical steel grades with distinct magnetic knee points:
>   - Standard Non-Oriented Silicon Steel (M400-50A / M270-35A): $B_{\text{knee}} \approx 1.65 - 1.75\,\text{T}$, $B_{\text{max}} \approx 1.80\,\text{T}$
>   - Thin-gauge High-Silicon Steel (NO20 / 10JNEX): $B_{\text{knee}} \approx 1.78\,\text{T}$
>   - Cobalt-Iron Aerospace Grade (Vacoflux 50 / Hiperco 50): $B_{\text{knee}} \approx 2.10 - 2.15\,\text{T}$, $B_{\text{max}} \approx 2.25\,\text{T}$
> - **Visual Feedback & Synchronized State**: Dual interactive margin gauges (Thermal Margin $\%$ and Magnetic Margin $\%$) with three-tier color coding:
>   - **Nominal** (Green / Emerald `< 85%` of limit): Safe continuous operation.
>   - **Caution** (Amber `85% - 100%` of limit): Elevated thermal rise or magnetic saturation knee approached.
>   - **Exceeded** (Crimson `> 100%` of limit): Thermal runaway risk or severe magnetic saturation.
>   - Synchronized color badges update both on the Performance Dashboard and in the top global KPI strip.

---

## 1. Overview & Core Concept

### What It Does
This capability acts as a real-time electromagnetic and thermal design validator. As users adjust motor geometry (bore diameter $D$, stack length $L$, slot dimensions $h_s, b_{s1}$, turns per phase $N_{ph}$, or loadings $B_{av}, ac$), the engine computes:
1. **Actual Stator Conductor Current Density**: $J = I_{ph} / a_{cu} \quad [\text{A/mm}^2]$
2. **Actual Stator Tooth Flux Density**: $B_{ts} = \frac{\Phi_t}{b_{ts} \cdot L \cdot k_{fe}} \quad [\text{T}]$
3. **Actual Stator Yoke Flux Density**: $B_{ys} = \frac{\Phi / 2}{h_{ys} \cdot L \cdot k_{fe}} \quad [\text{T}]$

It compares these values directly to the active cooling/insulation rating and lamination steel grade, reporting exact thermal headroom ($\Delta J = J_{\text{limit}} - J$) and saturation headroom ($\Delta B = B_{\text{sat}} - B_{ts}$), warning designers before committing invalid dimensions to PDF or Google Sheets.

---

## 2. User Experience & Visual Design

### Key User Flows
1. **Material & Cooling Configuration**:
   - In the Performance Dashboard, the user accesses the **"Thermal & Magnetic Material Envelope"** card.
   - The user selects the cooling system (e.g., *IC411 TEFC Air Cooling* vs. *IC71W Liquid Jacket*) and the insulation class (e.g., *Class F 155°C*). The thermal current density limit $J_{\text{limit}}$ adjusts dynamically.
   - The user selects the magnetic lamination alloy (e.g., *M400-50A Silicon Steel* vs. *Vacoflux 50 Cobalt-Iron*). The saturation knee threshold $B_{\text{knee}}$ updates accordingly.
2. **Live Margin Monitoring**:
   - Two radial/linear progress margin gauges show:
     - **Thermal Loading Utilization**: $U_{\text{thermal}} = (J / J_{\text{limit}}) \times 100\%$
     - **Tooth Magnetic Utilization**: $U_{\text{magnetic}} = (B_{ts} / B_{\text{sat}}) \times 100\%$
   - If either metric enters Caution ($85\%$) or Exceeded ($100\%$), the gauge smoothly transitions from emerald to amber or crimson.
3. **Synchronized Global KPI Highlighting**:
   - In the top persistent KPI strip and on the spreadsheet table, the corresponding metric cards ($J$, $B_{ts}$, $B_{ys}$) dynamically inherit high-visibility warning status borders, pulsing warning badges, and explanatory tooltips indicating recommended mitigation actions (e.g., *"Increase slot area $A_{\text{slot}}$ to lower $J$"* or *"Widen tooth $b_{ts}$ to relieve saturation"*).

---

## 3. Technical Architecture & Data Strategy

### System Component Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          App Level State Container                          │
│   ├── MaterialSpecs (CoolingMethod, InsulationClass, SteelGrade)            │
│   ├── Current MotorSpecs & CalculatedGeometry                               │
│   └── MaterialValidationStatus (ThermalStatus, MagneticStatus)              │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
        ┌──────────────────────────────┴──────────────────────────────┐
        ▼                                                             ▼
┌───────────────────────────────────────┐   ┌─────────────────────────────────┐
│           Top KPI Summary Strip       │   │      Performance Dashboard      │
│  - Stator Bore D                      │   │  ┌───────────────────────────┐  │
│  - Active Efficiency η                │   │  │ Thermal & Saturation      │  │
│  - Current Density J (Warning Pill)   │   │  │ Material Limits Card      │  │
│  - Tooth Flux Bts (Warning Pill)      │   │  │ - Cooling Selector        │  │
│  - Yoke Flux Bys (Warning Pill)       │   │  │ - Steel Grade Selector    │  │
│                                       │   │  │ - Real-Time Margin Meters │  │
│                                       │   │  │ - Mitigation Guidance     │  │
│                                       │   │  └───────────────────────────┘  │
└───────────────────────────────────────┘   └─────────────────────────────────┘
```

### Material Specifications & Physical Limits

```typescript
export type CoolingMethod = 'ic01_open' | 'ic411_tefc' | 'ic71w_liquid';
export type InsulationClass = 'class_b_130' | 'class_f_155' | 'class_h_180';
export type ElectricalSteelGrade = 'm400_50a' | 'm270_35a' | 'no20_thin' | 'vacoflux_50';

export interface MaterialLimits {
  cooling: CoolingMethod;
  insulation: InsulationClass;
  steelGrade: ElectricalSteelGrade;
  
  // Computed Limits
  maxCurrentDensityA_mm2: number;    // J_limit [A/mm²]
  saturationToothFluxTesla: number;  // B_sat_tooth [T]
  saturationYokeFluxTesla: number;   // B_sat_yoke [T]
}

export interface ValidationStatus {
  currentDensityUtilizationPct: number;
  toothFluxUtilizationPct: number;
  yokeFluxUtilizationPct: number;
  thermalStatus: 'nominal' | 'caution' | 'exceeded';
  magneticStatus: 'nominal' | 'caution' | 'exceeded';
}
```
