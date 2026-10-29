# Advanced Motor System Analysis, Efficiency Map & Engineering Suite

A comprehensive multi-physics motor system evaluation suite integrating 2D Torque-Speed Efficiency Map ($\eta(n, T)$) contours, industrial IEC 60034-1 duty-cycle analysis, dynamic lumped-parameter transient thermal hot-spot simulation, active material bill of materials (BOM) cost synthesis, and an engineering CAD DXF/CSV/JSON export suite housed in a dedicated System Analysis workspace.

---

### User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural and feature decisions were confirmed during the interactive clarification phase:

- **Confirmed Feature Scope**: Integrate all advanced features bundled together—including (1) 2D Torque-Speed Efficiency Map $\eta(n, T)$ with field weakening, (2) Active Material Mass, Volume & BOM Cost Synthesis, (3) Dynamic Transient Thermal Duty Cycle Simulator (LPTN hot-spot network), and (4) Comprehensive Engineering CAD DXF / CSV / JSON Export Suite.
- **Confirmed Workspace Layout**: Organized into a dedicated **System Analysis** tab (`'system'`) positioned alongside Sizing Sheet, 2D CAD, Winding Layout, and Performance Dashboard, giving the system-level analysis sufficient screen real estate.
- **Confirmed Drive Cycle Standard**: Prioritize industrial IEC 60034-1 variable-speed duty cycles (S1 Continuous, S2 Short-time, S3 Intermittent periodic, S6 Continuous operation with intermittent load, S9 Non-periodic load & speed variations) alongside standard WLTP/urban traction drive cycle presets.
- **Strict Anti-AI Slop Directive**: Zero AI chatbots, assistants, or LLM API calls. Every calculation is rooted in deterministic electrical machine physics, Maxwell analytical equations, and thermal lumped-parameter matrices.

---

### 1. Overview & Core Concept

#### What It Does
Provides motor engineers and electromagnetic designers with system-level analytical tools needed to validate machine performance beyond the single rated design point:
1. **2D Efficiency Map $\eta(n, T)$**: Generates the complete torque-speed operating envelope up to max field-weakening overspeed ($n_{\max}$), mapping loss segregation ($P_{\text{cu}}, P_{\text{fe}}, P_{\text{mech}}$), peak efficiency sweet spot ($\ge 95.5\%$), continuous thermal envelope, and peak overload boundary with interactive crosshair probing.
2. **Industrial IEC 60034-1 Duty Cycle Energy & Loss Evaluator**: Evaluates weighted energy consumption and root-mean-square thermal loading across standardized industrial duty cycles (S1 continuous, S2 30-min peak, S3 40% intermittent, S6 60% intermittent, and S9 variable-speed traction drive).
3. **Transient Thermal Duty Cycle Simulator**: Lumped-parameter 4-node thermal network ($C_{\text{th}} \frac{dT}{dt} = P_{\text{loss}} - \frac{\Delta T}{R_{\text{th}}}$) simulating dynamic copper winding, tooth, rotor, and frame temperatures over time during rapid acceleration bursts, overload pulses, and cooling phases.
4. **Active Material Mass, Volume & BOM Cost Engine**: Itemizes physical weights of silicon steel lamination stack, copper magnet wire, NdFeB rare-earth magnets or aluminum cage, and slot insulation; calculates specific torque density (N·m/kg), gravimetric power density (kW/kg), volumetric power density (kW/L), and per-unit production cost ($/kW, $/N·m) with live price sliders.
5. **Engineering Export Center**: Generates clean 2D vector CAD files (DXF R12 standard format with separate layers for stator, rotor, magnets, slots, and shaft), comprehensive engineering CSV loss tables, structured machine JSON definitions, and expanded multipage design reports.

#### Target Audience & Persona
Electric vehicle powertrain engineers, industrial drive designers, servo system specialists, and academic electromagnetic researchers needing rapid, deterministic machine validation.

#### Key Value
Bridges the gap between static analytical D²L sizing and full finite-element system simulation, delivering instant closed-loop insights on thermal endurance, energy efficiency maps, and manufacturing bill of materials.

---

### 2. User Experience & Visual Design

#### Key User Flows
1. **System Analysis Tab Navigation**: User switches between top-level tabs (`Sizing Sheet`, `2D CAD Geometry`, `Winding Layout`, `Performance & NVH`, and new `System Analysis`).
2. **Efficiency Map & Operating Point Inspection**:
   - User views the 2D contour map showing colored efficiency islands from $80\%$ up to $\ge 95.5\%$.
   - User hovers or drags the probe crosshair to any speed-torque coordinate $(n, T)$ to inspect instantaneous shaft power, copper loss, iron loss, mechanical friction/windage, and efficiency.
   - User toggles the drive cycle overlay to observe where operating points land relative to the continuous thermal rating boundary.
3. **Industrial Duty Cycle Energy Audit**:
   - User selects an IEC duty cycle preset (e.g., S3 40% Intermittent Crane Duty or S9 Variable Inverter Drive).
   - The system computes the thermal equivalent RMS current, average efficiency, and cumulative energy consumed (kWh/hour).
4. **Transient Thermal Simulation**:
   - User selects a thermal scenario (e.g., Cold Start to Steady State, 200% Overload Acceleration Burst for 60s, or Cyclic Inverter Pulsing).
   - An interactive time-domain temperature chart ($T(t)$ vs. time in minutes) plots winding hot-spot, tooth iron, and casing temperatures with insulation class thresholds (Class B $130^\circ\text{C}$, Class F $155^\circ\text{C}$, Class H $180^\circ\text{C}$).
5. **Active Material BOM & Economics**:
   - User adjusts raw material prices ($/kg for Copper, Silicon Steel, NdFeB, Aluminum).
   - Live cost breakdown graphs and specific performance metrics update instantaneously ($/kW, $/N·m, kW/kg, kW/L).
6. **CAD DXF & Data Export**:
   - User clicks **Export 2D CAD (DXF)** to download a production-ready `.dxf` file with proper layers (`STATOR_OUTER`, `STATOR_SLOTS`, `AIRGAP`, `ROTOR_OUTER`, `MAGNETS_BARRIER`, `SHAFT`).
   - User clicks **Export CSV / JSON** for full operating map grid tables and machine geometry matrices.

#### Visual Identity & Theme
- **Color Palette**: Aligned with the dark high-tech slate/cyan aesthetic (`bg-slate-950`, `bg-slate-900/90`, border `border-slate-800`).
- **Accents**:
  - Efficiency sweet spots: Emerald green (`#10b981`) and cyan (`#06b6d4`).
  - Thermal boundaries & overload: Rose (`#f43f5e`) and amber (`#f59e0b`).
  - Magnetic/iron metrics: Violet (`#8b5cf6`) and indigo (`#6366f1`).
- **Typography**: Clean monospace fonts (`font-mono`) for precision SI engineering figures, crisp badge indicators, and tabular figures.

---

### 3. Key Product Decisions & Trade-Offs

#### Decision 1: Dedicated System Analysis Tab vs. Cramming into Performance Dashboard
- **Chosen Approach**: Create a dedicated `System Analysis` top-level tab in `App.tsx` and `Header.tsx`, while maintaining cross-references in the Performance Dashboard.
- **Why**: The Performance Dashboard already contains 6 deep cards (Torque-Speed curve, NVH radial force spectrum, Back-EMF harmonic analysis, Loss breakdown, Temperature resistance simulation, and FEA Magnetic Saturation). Giving the 2D Efficiency Map, Transient Thermal Simulator, BOM Cost Calculator, and DXF Export Center their own dedicated tab ensures clean responsive layouts and uncompromised interactive SVG canvases.

#### Decision 2: Analytical LPTN vs. Full FEA Mesh for Transient Thermal
- **Chosen Approach**: 4-Node Lumped-Parameter Thermal Network (LPTN) solved via dynamic Runge-Kutta / finite-difference state-space equations ($dT/dt = \mathbf{C}^{-1} (\mathbf{P} - \mathbf{G} T)$).
- **Why**: Instantaneous 60 fps simulation in the browser without 10-minute meshing latency, while remaining accurate within 3–5% of conjugate heat transfer tests for standardized machine frames.

#### Decision 3: Standard DXF R12 Format for CAD Export
- **Chosen Approach**: Client-side pure ASCII DXF (Release 12/2000 compatibility) generated directly in TypeScript with concentric CIRCLE and LINE/POLYLINE entities for stator bore, yoke, rotor, teeth, and slot geometries.
- **Why**: Zero external dependencies required, compatible with AutoCAD, SolidWorks, FreeCAD, Fusion 360, and laser cutting machines out of the box.

---

### 4. Technical Architecture & Data Strategy

#### System Layout & Component Hierarchy

```
┌────────────────────────────────────────────────────────────────────────┐
│                                App.tsx                                 │
│  State: currentSpecs, calculatedGeometry, materialConfig, activeTab    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
    ┌───────────────────────────────┼──────────────────────────────┐
    ▼                               ▼                              ▼
┌──────────────┐          ┌───────────────────┐          ┌───────────────────────┐
│  Header.tsx  │          │PerformanceDashboard│         │   SystemAnalysisView  │
│ (Tab Router) │          │(Torque/NVH/Sat/Loss│          │(New Dedicated Module) │
└──────────────┘          └───────────────────┘          └───────────┬───────────┘
                                                                     │
            ┌───────────────────────┬────────────────────────────────┼──────────────────────────────┐
            ▼                       ▼                                ▼                              ▼
┌───────────────────────┐ ┌───────────────────┐ ┌─────────────────────────────┐ ┌─────────────────────────┐
│ EfficiencyMapCard.tsx │ │DutyCycleProfile.tsx││TransientThermalSimulator.tsx│ │ ActiveMaterialBomCard   │
│ - 2D (n, T) Map SVG   │ │ - IEC S1-S9 Duty  │ │ - 4-Node LPTN Runge-Kutta   │ │ - Weight & Cost ($/kg)  │
│ - Field Weakening     │ │ - RMS Current/Loss│ │ - Transient T(t) Plot       │ │ - Specific Power kW/kg  │
│ - Interactive Probe   │ │ - Energy Audit    │ │ - Hot-Spot Insulation Margin│ │ - DXF & Report Export   │
└───────────┬───────────┘ └───────────────────┘ └─────────────────────────────┘ └─────────────────────────┘
            │
            ▼
┌────────────────────────────────────────┐
│ Mathematical & Physical Utilities      │
│ - efficiencyMapAnalysis.ts             │
│ - transientThermalAnalysis.ts (New)    │
│ - materialCostAnalysis.ts              │
│ - dxfExportGenerator.ts (New)          │
└────────────────────────────────────────┘
```

#### Key Data Models & Calculations

1. **Efficiency Map Calculation (`efficiencyMapAnalysis.ts`)**:
   - Boundary curves: $T_{\text{cont}}(n)$ and $T_{\text{pk}}(n)$ up to $n_{\max} = 2.5 \times n_b$.
   - Loss breakdown: $P_{\text{cu}} = 3 I^2 R_{\text{ph}}(T)$, $P_{\text{fe}} = k_h f B^{1.8} + k_e f^2 B^2$, $P_{\text{mech}} = k_w n^{2.1}$.
   - Efficiency grid: $\eta(n, T) = \frac{P_{\text{out}}}{P_{\text{out}} + P_{\text{cu}} + P_{\text{fe}} + P_{\text{mech}} + P_{\text{stray}}}$.

2. **Transient Thermal Simulation (`transientThermalAnalysis.ts`)**:
   - Nodes: 1: Stator Winding Copper ($C_1$), 2: Stator Teeth & Yoke Core ($C_2$), 3: Rotor Active Core ($C_3$), 4: Outer Housing/Frame ($C_4$).
   - Thermal conductances ($G_{ij} = 1/R_{ij}$) computed from slot liner mica/Nomex, airgap convective Taylor number, and housing cooling method (IC411 TEFC, Water Jacket, etc.).
   - Dynamic simulation time: $t \in [0, 3600\,\text{s}]$ with variable load pulses.

3. **Active Material Mass & Cost Synthesis (`materialCostAnalysis.ts`)**:
   - Computes mass: $m = V \times \rho$ ($\rho_{\text{cu}} = 8960\,\text{kg/m}^3$, $\rho_{\text{fe}} = 7650\,\text{kg/m}^3$, $\rho_{\text{mag}} = 7500\,\text{kg/m}^3$).
   - Specific metrics: $\tau_{\text{spec}} = T_{\text{rated}} / m_{\text{active}}$ (N·m/kg), $p_{\text{spec}} = P_{\text{rated}} / m_{\text{active}}$ (kW/kg).
   - BOM Cost = $\sum m_i \times \text{Price}_i$ + manufacturing stamping & winding factor.

4. **AutoCAD DXF Exporter (`dxfExportGenerator.ts`)**:
   - Generates standard DXF header, tables, layers (`0`, `STATOR_CORE`, `STATOR_SLOTS`, `WINDINGS`, `AIRGAP`, `ROTOR_CORE`, `ROTOR_MAGNETS`, `SHAFT`), and concentric vector geometry for instant mechanical CAD interoperability.
