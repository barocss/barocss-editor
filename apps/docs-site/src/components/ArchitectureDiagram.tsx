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
        Model["Model<br/>@barocss/model<br/>Document Data"]
        Schema["Schema<br/>@barocss/schema<br/>Structure Definition"]
        DataStore["DataStore<br/>@barocss/datastore<br/>Transactional Store"]
    end

    subgraph templatelayer["Template Layer"]
        DSL["DSL<br/>@barocss/dsl<br/>Template Definition"]
        Registry["Registry<br/>@barocss/dsl<br/>Template Lookup"]
    end

    subgraph renderinglayer["Rendering Layer"]
        VNodeBuilder["VNodeBuilder<br/>@barocss/renderer-dom<br/>Template → VNode"]
        VNode["VNode<br/>@barocss/renderer-dom<br/>Virtual DOM"]
        DOMReconcile["DOMReconcile<br/>@barocss/renderer-dom<br/>VNode → DOM"]
    end

    subgraph editorlayer["Editor Layer"]
        EditorCore["Editor Core<br/>@barocss/editor-core<br/>Commands & Context"]
        EditorView["Editor View<br/>@barocss/editor-view-dom<br/>Input & Selection"]
    end

    subgraph output["Output"]
        DOM["DOM<br/>Rendered Output"]
    end

    Model --> DSL
    Schema --> Model
    DataStore --> Model
    DSL --> Registry
    Registry --> VNodeBuilder
    Model --> VNodeBuilder
    VNodeBuilder --> VNode
    VNode --> DOMReconcile
    DOMReconcile --> DOM
    
    EditorCore --> Model
    EditorView --> EditorCore
    EditorView --> DOMReconcile

    style Model fill:#3b82f6,stroke:#2563eb,color:#fff
    style DSL fill:#60a5fa,stroke:#3b82f6,color:#fff
    style VNode fill:#93c5fd,stroke:#60a5fa,color:#000
    style DOM fill:#dbeafe,stroke:#93c5fd,color:#000
    style EditorCore fill:#f59e0b,stroke:#d97706,color:#fff
    style EditorView fill:#fbbf24,stroke:#f59e0b,color:#000
    style Schema fill:#8b5cf6,stroke:#7c3aed,color:#fff
    style DataStore fill:#8b5cf6,stroke:#7c3aed,color:#fff
    style Registry fill:#60a5fa,stroke:#3b82f6,color:#fff
    style VNodeBuilder fill:#93c5fd,stroke:#60a5fa,color:#000
    style DOMReconcile fill:#a5b4fc,stroke:#818cf8,color:#000
    style datalayer fill:#f3f4f6,stroke:#8b5cf6,stroke-width:2px
    style templatelayer fill:#f3f4f6,stroke:#60a5fa,stroke-width:2px
    style renderinglayer fill:#f3f4f6,stroke:#93c5fd,stroke-width:2px
    style editorlayer fill:#f3f4f6,stroke:#f59e0b,stroke-width:2px
    style output fill:#f3f4f6,stroke:#dbeafe,stroke-width:2px`;

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
