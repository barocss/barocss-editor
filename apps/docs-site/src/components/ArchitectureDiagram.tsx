import React, { useEffect, useRef } from 'react';
import mermaid from 'mermaid';
import './ArchitectureDiagram.css';

export default function ArchitectureDiagram() {
  const diagramRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!diagramRef.current) return;

    mermaid.initialize({
      startOnLoad: false,
      theme: 'default',
      securityLevel: 'loose',
      flowchart: {
        useMaxWidth: false,
        htmlLabels: true,
        curve: 'basis',
        padding: 20,
      },
    });

    const diagramDefinition = `graph TB
    subgraph datalayer["Data Layer"]
        Schema["Schema<br/>@barocss/schema"]
        DataStore["DataStore<br/>@barocss/datastore"]
        Model["Model<br/>@barocss/model"]
    end

    subgraph templatelayer["Template Layer"]
        DSL["DSL<br/>@barocss/dsl"]
        Registry["Registry<br/>Template Lookup"]
    end

    subgraph renderinglayer["Rendering Layer"]
        direction LR
        subgraph dompath["DOM Path"]
            VNodeBuilder["VNodeBuilder"]
            VNode["VNode"]
            DOMReconcile["DOMReconcile"]
        end
        subgraph reactpath["React Path"]
            BuildToReact["buildToReact"]
            ReactNode["ReactNode"]
        end
    end

    subgraph editorlayer["Editor Layer"]
        EditorCore["Editor Core<br/>@barocss/editor-core"]
        EditorViewDOM["Editor View DOM<br/>@barocss/editor-view-dom"]
        EditorViewReact["Editor View React<br/>@barocss/editor-view-react"]
    end

    subgraph extlayer["Extensions & Collaboration"]
        Extensions["Extensions<br/>@barocss/extensions"]
        Collaboration["Collaboration<br/>@barocss/collaboration"]
        Converter["Converter<br/>@barocss/converter"]
    end

    subgraph output["Output"]
        DOM["DOM"]
        ReactDOM["React DOM"]
    end

    Schema --> DataStore
    DataStore --> Model
    Model --> DSL
    DSL --> Registry

    Registry --> VNodeBuilder
    Registry --> BuildToReact
    Model --> VNodeBuilder
    Model --> BuildToReact

    VNodeBuilder --> VNode
    VNode --> DOMReconcile
    DOMReconcile --> DOM
    BuildToReact --> ReactNode
    ReactNode --> ReactDOM

    EditorCore --> Model
    EditorViewDOM --> EditorCore
    EditorViewDOM --> DOMReconcile
    EditorViewReact --> EditorCore
    EditorViewReact --> BuildToReact

    Extensions --> EditorCore
    Collaboration --> DataStore
    Converter --> Model

    style Schema fill:#8b5cf6,stroke:#7c3aed,color:#fff
    style DataStore fill:#8b5cf6,stroke:#7c3aed,color:#fff
    style Model fill:#3b82f6,stroke:#2563eb,color:#fff
    style DSL fill:#60a5fa,stroke:#3b82f6,color:#fff
    style Registry fill:#60a5fa,stroke:#3b82f6,color:#fff
    style VNodeBuilder fill:#93c5fd,stroke:#60a5fa,color:#000
    style VNode fill:#93c5fd,stroke:#60a5fa,color:#000
    style DOMReconcile fill:#a5b4fc,stroke:#818cf8,color:#000
    style BuildToReact fill:#34d399,stroke:#10b981,color:#000
    style ReactNode fill:#34d399,stroke:#10b981,color:#000
    style DOM fill:#dbeafe,stroke:#93c5fd,color:#000
    style ReactDOM fill:#d1fae5,stroke:#34d399,color:#000
    style EditorCore fill:#f59e0b,stroke:#d97706,color:#fff
    style EditorViewDOM fill:#fbbf24,stroke:#f59e0b,color:#000
    style EditorViewReact fill:#fbbf24,stroke:#f59e0b,color:#000
    style Extensions fill:#fb923c,stroke:#f97316,color:#000
    style Collaboration fill:#fb923c,stroke:#f97316,color:#000
    style Converter fill:#fb923c,stroke:#f97316,color:#000
    style datalayer fill:#f5f3ff,stroke:#8b5cf6,stroke-width:2px
    style templatelayer fill:#eff6ff,stroke:#60a5fa,stroke-width:2px
    style renderinglayer fill:#f0f9ff,stroke:#93c5fd,stroke-width:2px
    style dompath fill:#eff6ff,stroke:#93c5fd,stroke-width:1px
    style reactpath fill:#ecfdf5,stroke:#34d399,stroke-width:1px
    style editorlayer fill:#fffbeb,stroke:#f59e0b,stroke-width:2px
    style extlayer fill:#fff7ed,stroke:#fb923c,stroke-width:2px
    style output fill:#f9fafb,stroke:#d1d5db,stroke-width:2px`;

    const id = `architecture-diagram-${Date.now()}`;
    const mermaidDiv = document.createElement('div');
    mermaidDiv.className = 'mermaid';
    mermaidDiv.id = id;
    mermaidDiv.textContent = diagramDefinition;
    diagramRef.current.innerHTML = '';
    diagramRef.current.appendChild(mermaidDiv);

    mermaid.run({
      nodes: [mermaidDiv],
    }).catch((err) => {
      console.error('Mermaid rendering error:', err);
    });
  }, []);

  return (
    <div className="architecture-diagram">
      <div ref={diagramRef} className="mermaid-container"></div>
    </div>
  );
}
