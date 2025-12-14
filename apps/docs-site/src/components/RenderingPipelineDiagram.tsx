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
    Model["Model<br/>Document Data<br/>{stype, sid, text}"]
    Registry["Registry<br/>@barocss/dsl<br/>Template Lookup"]
    Template["Template<br/>DSL Definition<br/>element, data, when"]
    VNodeBuilder["VNodeBuilder<br/>@barocss/renderer-dom<br/>Template × Data"]
    VNode["VNode<br/>Virtual DOM<br/>Tree Structure"]
    DOMReconcile["DOMReconcile<br/>@barocss/renderer-dom<br/>Diff & Update"]
    DOM["DOM<br/>Rendered Output<br/>HTML Elements"]

    Model -->|"1. Query by stype"| Registry
    Registry -->|"2. Get Template"| Template
    Template -->|"3. Build VNode"| VNodeBuilder
    Model -->|"4. Apply Data"| VNodeBuilder
    VNodeBuilder -->|"5. Generate"| VNode
    VNode -->|"6. Reconcile"| DOMReconcile
    DOMReconcile -->|"7. Update"| DOM

    style Model fill:#3b82f6,stroke:#2563eb,color:#fff
    style Registry fill:#60a5fa,stroke:#3b82f6,color:#fff
    style Template fill:#60a5fa,stroke:#3b82f6,color:#fff
    style VNodeBuilder fill:#93c5fd,stroke:#60a5fa,color:#000
    style VNode fill:#93c5fd,stroke:#60a5fa,color:#000
    style DOMReconcile fill:#a5b4fc,stroke:#818cf8,color:#000
    style DOM fill:#dbeafe,stroke:#93c5fd,color:#000`;

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
