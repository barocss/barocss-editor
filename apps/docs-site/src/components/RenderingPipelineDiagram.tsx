import React, { useEffect, useRef } from 'react';
import mermaid from 'mermaid';
import './ArchitectureDiagram.css';

export default function RenderingPipelineDiagram() {
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

    const diagramDefinition = `graph LR
    Model["Model<br/>{stype, sid, text}"]
    Registry["Registry<br/>Template Lookup"]
    Template["Template<br/>DSL Definition"]

    subgraph domRenderer["renderer-dom"]
        VNodeBuilder["VNodeBuilder<br/>Template × Data"]
        VNode["VNode<br/>Virtual DOM"]
        DOMReconcile["DOMReconcile<br/>Diff & Patch"]
    end

    subgraph reactRenderer["renderer-react"]
        BuildToReact["buildToReact<br/>Template × Data"]
        ReactOutput["ReactNode<br/>React Elements"]
    end

    DOM["DOM"]
    ReactDOM["React DOM"]

    Model -->|"1. stype"| Registry
    Registry -->|"2. lookup"| Template
    Template -->|"3a. DOM path"| VNodeBuilder
    Template -->|"3b. React path"| BuildToReact
    Model -->|"data"| VNodeBuilder
    Model -->|"data"| BuildToReact
    VNodeBuilder -->|"4a."| VNode
    VNode -->|"5a. reconcile"| DOMReconcile
    DOMReconcile -->|"6a."| DOM
    BuildToReact -->|"4b."| ReactOutput
    ReactOutput -->|"5b."| ReactDOM

    style Model fill:#3b82f6,stroke:#2563eb,color:#fff
    style Registry fill:#60a5fa,stroke:#3b82f6,color:#fff
    style Template fill:#60a5fa,stroke:#3b82f6,color:#fff
    style VNodeBuilder fill:#93c5fd,stroke:#60a5fa,color:#000
    style VNode fill:#93c5fd,stroke:#60a5fa,color:#000
    style DOMReconcile fill:#a5b4fc,stroke:#818cf8,color:#000
    style BuildToReact fill:#34d399,stroke:#10b981,color:#000
    style ReactOutput fill:#34d399,stroke:#10b981,color:#000
    style DOM fill:#dbeafe,stroke:#93c5fd,color:#000
    style ReactDOM fill:#d1fae5,stroke:#34d399,color:#000
    style domRenderer fill:#eff6ff,stroke:#93c5fd,stroke-width:2px
    style reactRenderer fill:#ecfdf5,stroke:#34d399,stroke-width:2px`;

    const id = `rendering-pipeline-${Date.now()}`;
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
