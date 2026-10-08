import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createServer, request as httpRequest } from 'node:http';
import { mkdirSync, mkdtempSync, chmodSync, writeFileSync, readFileSync, realpathSync, readdirSync, statSync, existsSync, createWriteStream, cpSync, symlinkSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { parseRegistryDefinition } from '@barocss/schema/registry-contract';

// Actual own compiled HTTP process/private PostgreSQL with controlled signed JWKS.
// No browser login, LLM, document schema adoption, MCP or external deployment claim.
const HTTP_NATIVE_FIXTURES = {
  "SOURCE_A": {
    "format": "barocss-note",
    "version": 2,
    "savedAt": "authored stamp A / Café",
    "schemaBundle": {
      "bundleVersion": 1,
      "digestAlgorithm": "wonffice.canonical-json.sha256.v1",
      "selected": [
        {
          "schemaId": "11111111-1111-1111-1111-111111111111",
          "version": 1,
          "digest": "0e35de697c2ce77c04c03ecd68344763d73d9656a4484b6824f6c0414917ed1a"
        }
      ],
      "definitions": [
        {
          "reference": {
            "schemaId": "22222222-2222-2222-2222-222222222222",
            "version": 2,
            "digest": "20cca32c0fd5abdaae11f82e327b6456c248d13421be0b2966d9e7884aeb0305"
          },
          "definitionText": "{\n    \"dialect\": \"wonffice.note-fields.v1\",\n    \"scope\": {\n        \"tenantId\": \"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\",\n        \"workspaceId\": \"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb\"\n    },\n    \"schemaId\": \"22222222-2222-2222-2222-222222222222\",\n    \"version\": 2,\n    \"parent\": {\n        \"schemaId\": \"22222222-2222-2222-2222-222222222222\",\n        \"version\": 1,\n        \"digest\": \"4d4891751b5d9b86ea92afbdd02300dac31e139d4a69adcde28db2b43e83e0f9\"\n    },\n    \"dependencies\": [],\n    \"requiredCapabilities\": [\n        \"note.field.choice.v1\",\n        \"note.field.text.v1\"\n    ],\n    \"dataset\": {\n        \"name\": \"reference labels\",\n        \"fields\": [\n            {\n                \"name\": \"State\",\n                \"kind\": \"choice\",\n                \"options\": [\n                    \"검토\",\n                    \"초안\"\n                ]\n            },\n            {\n                \"name\": \"Label\",\n                \"kind\": \"text\",\n                \"label\": \"Café\"\n            }\n        ]\n    }\n}\n"
        },
        {
          "reference": {
            "schemaId": "11111111-1111-1111-1111-111111111111",
            "version": 1,
            "digest": "0e35de697c2ce77c04c03ecd68344763d73d9656a4484b6824f6c0414917ed1a"
          },
          "definitionText": "{\n  \"dialect\": \"wonffice.note-fields.v1\",\n  \"scope\": {\n    \"tenantId\": \"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\",\n    \"workspaceId\": \"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb\"\n  },\n  \"schemaId\": \"11111111-1111-1111-1111-111111111111\",\n  \"version\": 1,\n  \"parent\": null,\n  \"dependencies\": [\n    {\n      \"schemaId\": \"22222222-2222-2222-2222-222222222222\",\n      \"version\": 2,\n      \"digest\": \"20cca32c0fd5abdaae11f82e327b6456c248d13421be0b2966d9e7884aeb0305\"\n    }\n  ],\n  \"requiredCapabilities\": [\n    \"note.field.choice.v1\",\n    \"note.field.boolean.v1\",\n    \"note.field.number.v1\",\n    \"note.field.text.v1\"\n  ],\n  \"dataset\": {\n    \"name\": \"review-items\",\n    \"fields\": [\n      {\n        \"name\": \"State\",\n        \"kind\": \"choice\",\n        \"options\": [\n          \"진행\",\n          \"계획\"\n        ]\n      },\n      {\n        \"name\": \"Done\",\n        \"kind\": \"boolean\"\n      },\n      {\n        \"name\": \"Count\",\n        \"kind\": \"number\"\n      },\n      {\n        \"name\": \"Label\",\n        \"kind\": \"text\",\n        \"label\": \"Café\"\n      }\n    ]\n  }\n}\n"
        },
        {
          "reference": {
            "schemaId": "22222222-2222-2222-2222-222222222222",
            "version": 1,
            "digest": "4d4891751b5d9b86ea92afbdd02300dac31e139d4a69adcde28db2b43e83e0f9"
          },
          "definitionText": "{\n \"dialect\": \"wonffice.note-fields.v1\",\n \"scope\": {\n  \"tenantId\": \"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\",\n  \"workspaceId\": \"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb\"\n },\n \"schemaId\": \"22222222-2222-2222-2222-222222222222\",\n \"version\": 1,\n \"parent\": null,\n \"dependencies\": [],\n \"requiredCapabilities\": [\n  \"note.field.text.v1\"\n ],\n \"dataset\": {\n  \"name\": \"reference labels\",\n  \"fields\": [\n   {\n    \"name\": \"Label\",\n    \"kind\": \"text\",\n    \"label\": \"Café\"\n   }\n  ]\n }\n}\n"
        }
      ]
    },
    "document": {
      "stype": "note",
      "attributes": {
        "title": "검토 자료 A",
        "pageId": "native2-note-A",
        "authoredTag": "preserve-A"
      },
      "metadata": {
        "sourceRevision": 7,
        "annotation": null,
        "labels": [
          "검토",
          "Café"
        ]
      },
      "content": [
        {
          "stype": "heading",
          "attributes": {
            "level": 2
          },
          "content": [
            {
              "stype": "inline-text",
              "text": "목표 A",
              "marks": [
                {
                  "stype": "bold",
                  "range": [
                    0,
                    2
                  ]
                }
              ]
            }
          ]
        },
        {
          "stype": "paragraph",
          "attributes": {
            "alignment": "left"
          },
          "metadata": {
            "source": "authored-A",
            "annotation": null
          },
          "content": [
            {
              "stype": "inline-text",
              "text": "Café 검토 A",
              "marks": [
                {
                  "stype": "italic",
                  "range": [
                    0,
                    5
                  ]
                }
              ]
            },
            {
              "stype": "inline-text",
              "text": " / marks 생략"
            },
            {
              "stype": "pageReference",
              "attributes": {
                "pageId": "native2-note-A",
                "title": "A 내부"
              }
            },
            {
              "stype": "pageReference",
              "attributes": {
                "pageId": "external-note-A",
                "title": "A 외부"
              }
            }
          ]
        },
        {
          "stype": "codeBlock",
          "attributes": {
            "language": "typescript"
          },
          "content": [
            {
              "stype": "inline-text",
              "text": "const total = 7;"
            }
          ]
        },
        {
          "stype": "bTable",
          "content": [
            {
              "stype": "bTableBody",
              "content": [
                {
                  "stype": "bTableRow",
                  "content": [
                    {
                      "stype": "bTableCell",
                      "content": [
                        {
                          "stype": "inline-text",
                          "text": "A cell",
                          "marks": []
                        }
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          "stype": "resources",
          "content": [
            {
              "stype": "dataset",
              "attributes": {
                "name": "review-items",
                "fields": [
                  {
                    "name": "State",
                    "kind": "choice",
                    "options": [
                      "진행",
                      "계획"
                    ]
                  },
                  {
                    "name": "Done",
                    "kind": "boolean"
                  },
                  {
                    "name": "Count",
                    "kind": "number"
                  },
                  {
                    "name": "Label",
                    "kind": "text",
                    "label": "Café"
                  }
                ],
                "rowIds": [
                  "row-A-2",
                  "row-A-1"
                ],
                "records": [
                  {
                    "State": "진행",
                    "Done": false,
                    "Count": 7,
                    "Label": "자료 A"
                  },
                  {
                    "Label": "값 생략 A"
                  }
                ]
              }
            },
            {
              "stype": "richText",
              "attributes": {
                "id": "row-A-2"
              },
              "metadata": {
                "note": null
              },
              "content": [
                {
                  "stype": "paragraph",
                  "content": [
                    {
                      "stype": "inline-text",
                      "text": "항목 본문 A",
                      "marks": [
                        {
                          "stype": "underline",
                          "range": [
                            0,
                            2
                          ]
                        }
                      ]
                    },
                    {
                      "stype": "pageReference",
                      "attributes": {
                        "pageId": "native2-note-A",
                        "title": "A 자료 내부"
                      }
                    },
                    {
                      "stype": "pageReference",
                      "attributes": {
                        "pageId": "external-note-A",
                        "title": "A 자료 외부"
                      }
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  },
  "SOURCE_B": {
    "format": "barocss-note",
    "version": 2,
    "schemaBundle": {
      "bundleVersion": 1,
      "digestAlgorithm": "wonffice.canonical-json.sha256.v1",
      "selected": [
        {
          "schemaId": "11111111-1111-1111-1111-111111111111",
          "version": 1,
          "digest": "0e35de697c2ce77c04c03ecd68344763d73d9656a4484b6824f6c0414917ed1a"
        }
      ],
      "definitions": [
        {
          "reference": {
            "schemaId": "22222222-2222-2222-2222-222222222222",
            "version": 2,
            "digest": "20cca32c0fd5abdaae11f82e327b6456c248d13421be0b2966d9e7884aeb0305"
          },
          "definitionText": "{\n    \"dialect\": \"wonffice.note-fields.v1\",\n    \"scope\": {\n        \"tenantId\": \"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\",\n        \"workspaceId\": \"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb\"\n    },\n    \"schemaId\": \"22222222-2222-2222-2222-222222222222\",\n    \"version\": 2,\n    \"parent\": {\n        \"schemaId\": \"22222222-2222-2222-2222-222222222222\",\n        \"version\": 1,\n        \"digest\": \"4d4891751b5d9b86ea92afbdd02300dac31e139d4a69adcde28db2b43e83e0f9\"\n    },\n    \"dependencies\": [],\n    \"requiredCapabilities\": [\n        \"note.field.choice.v1\",\n        \"note.field.text.v1\"\n    ],\n    \"dataset\": {\n        \"name\": \"reference labels\",\n        \"fields\": [\n            {\n                \"name\": \"State\",\n                \"kind\": \"choice\",\n                \"options\": [\n                    \"검토\",\n                    \"초안\"\n                ]\n            },\n            {\n                \"name\": \"Label\",\n                \"kind\": \"text\",\n                \"label\": \"Café\"\n            }\n        ]\n    }\n}\n"
        },
        {
          "reference": {
            "schemaId": "11111111-1111-1111-1111-111111111111",
            "version": 1,
            "digest": "0e35de697c2ce77c04c03ecd68344763d73d9656a4484b6824f6c0414917ed1a"
          },
          "definitionText": "{\n  \"dialect\": \"wonffice.note-fields.v1\",\n  \"scope\": {\n    \"tenantId\": \"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\",\n    \"workspaceId\": \"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb\"\n  },\n  \"schemaId\": \"11111111-1111-1111-1111-111111111111\",\n  \"version\": 1,\n  \"parent\": null,\n  \"dependencies\": [\n    {\n      \"schemaId\": \"22222222-2222-2222-2222-222222222222\",\n      \"version\": 2,\n      \"digest\": \"20cca32c0fd5abdaae11f82e327b6456c248d13421be0b2966d9e7884aeb0305\"\n    }\n  ],\n  \"requiredCapabilities\": [\n    \"note.field.choice.v1\",\n    \"note.field.boolean.v1\",\n    \"note.field.number.v1\",\n    \"note.field.text.v1\"\n  ],\n  \"dataset\": {\n    \"name\": \"review-items\",\n    \"fields\": [\n      {\n        \"name\": \"State\",\n        \"kind\": \"choice\",\n        \"options\": [\n          \"진행\",\n          \"계획\"\n        ]\n      },\n      {\n        \"name\": \"Done\",\n        \"kind\": \"boolean\"\n      },\n      {\n        \"name\": \"Count\",\n        \"kind\": \"number\"\n      },\n      {\n        \"name\": \"Label\",\n        \"kind\": \"text\",\n        \"label\": \"Café\"\n      }\n    ]\n  }\n}\n"
        },
        {
          "reference": {
            "schemaId": "22222222-2222-2222-2222-222222222222",
            "version": 1,
            "digest": "4d4891751b5d9b86ea92afbdd02300dac31e139d4a69adcde28db2b43e83e0f9"
          },
          "definitionText": "{\n \"dialect\": \"wonffice.note-fields.v1\",\n \"scope\": {\n  \"tenantId\": \"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\",\n  \"workspaceId\": \"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb\"\n },\n \"schemaId\": \"22222222-2222-2222-2222-222222222222\",\n \"version\": 1,\n \"parent\": null,\n \"dependencies\": [],\n \"requiredCapabilities\": [\n  \"note.field.text.v1\"\n ],\n \"dataset\": {\n  \"name\": \"reference labels\",\n  \"fields\": [\n   {\n    \"name\": \"Label\",\n    \"kind\": \"text\",\n    \"label\": \"Café\"\n   }\n  ]\n }\n}\n"
        }
      ]
    },
    "document": {
      "stype": "note",
      "attributes": {
        "title": "검토 자료 B",
        "pageId": "native2-note-B",
        "authoredTag": "preserve-B"
      },
      "metadata": {
        "annotation": null,
        "sourceRevision": 3
      },
      "content": [
        {
          "stype": "paragraph",
          "content": [
            {
              "stype": "inline-text",
              "text": "검토 B",
              "marks": [
                {
                  "stype": "strike",
                  "range": [
                    0,
                    2
                  ]
                }
              ]
            },
            {
              "stype": "inline-text",
              "text": " / 생략 B"
            },
            {
              "stype": "pageReference",
              "attributes": {
                "pageId": "native2-note-B",
                "title": "B 내부"
              }
            },
            {
              "stype": "pageReference",
              "attributes": {
                "pageId": "external-note-B",
                "title": "B 외부"
              }
            }
          ]
        },
        {
          "stype": "resources",
          "content": [
            {
              "stype": "dataset",
              "attributes": {
                "name": "review-items",
                "fields": [
                  {
                    "name": "State",
                    "kind": "choice",
                    "options": [
                      "진행",
                      "계획"
                    ]
                  },
                  {
                    "name": "Done",
                    "kind": "boolean"
                  },
                  {
                    "name": "Count",
                    "kind": "number"
                  },
                  {
                    "name": "Label",
                    "kind": "text",
                    "label": "Café"
                  }
                ],
                "rowIds": [
                  "row-B-1"
                ],
                "records": [
                  {
                    "State": "계획",
                    "Done": true,
                    "Count": 0,
                    "Label": "자료 B"
                  }
                ]
              }
            },
            {
              "stype": "richText",
              "attributes": {
                "id": "row-B-1"
              },
              "content": [
                {
                  "stype": "paragraph",
                  "content": [
                    {
                      "stype": "inline-text",
                      "text": "B 자료 본문"
                    },
                    {
                      "stype": "pageReference",
                      "attributes": {
                        "pageId": "native2-note-B",
                        "title": "B 자료 내부"
                      }
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  },
  "TARGET_A2": {
    "format": "barocss-note",
    "version": 2,
    "savedAt": "authored stamp A / Café",
    "schemaBundle": {
      "bundleVersion": 1,
      "digestAlgorithm": "wonffice.canonical-json.sha256.v1",
      "selected": [
        {
          "schemaId": "11111111-1111-1111-1111-111111111111",
          "version": 2,
          "digest": "c73df69758346deeb34cc3be23f7e0629aa9069907fb5293207e1faed4e416fd"
        }
      ],
      "definitions": [
        {
          "reference": {
            "schemaId": "22222222-2222-2222-2222-222222222222",
            "version": 2,
            "digest": "20cca32c0fd5abdaae11f82e327b6456c248d13421be0b2966d9e7884aeb0305"
          },
          "definitionText": "{\n    \"dialect\": \"wonffice.note-fields.v1\",\n    \"scope\": {\n        \"tenantId\": \"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\",\n        \"workspaceId\": \"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb\"\n    },\n    \"schemaId\": \"22222222-2222-2222-2222-222222222222\",\n    \"version\": 2,\n    \"parent\": {\n        \"schemaId\": \"22222222-2222-2222-2222-222222222222\",\n        \"version\": 1,\n        \"digest\": \"4d4891751b5d9b86ea92afbdd02300dac31e139d4a69adcde28db2b43e83e0f9\"\n    },\n    \"dependencies\": [],\n    \"requiredCapabilities\": [\n        \"note.field.choice.v1\",\n        \"note.field.text.v1\"\n    ],\n    \"dataset\": {\n        \"name\": \"reference labels\",\n        \"fields\": [\n            {\n                \"name\": \"State\",\n                \"kind\": \"choice\",\n                \"options\": [\n                    \"검토\",\n                    \"초안\"\n                ]\n            },\n            {\n                \"name\": \"Label\",\n                \"kind\": \"text\",\n                \"label\": \"Café\"\n            }\n        ]\n    }\n}\n"
        },
        {
          "reference": {
            "schemaId": "11111111-1111-1111-1111-111111111111",
            "version": 1,
            "digest": "0e35de697c2ce77c04c03ecd68344763d73d9656a4484b6824f6c0414917ed1a"
          },
          "definitionText": "{\n  \"dialect\": \"wonffice.note-fields.v1\",\n  \"scope\": {\n    \"tenantId\": \"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\",\n    \"workspaceId\": \"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb\"\n  },\n  \"schemaId\": \"11111111-1111-1111-1111-111111111111\",\n  \"version\": 1,\n  \"parent\": null,\n  \"dependencies\": [\n    {\n      \"schemaId\": \"22222222-2222-2222-2222-222222222222\",\n      \"version\": 2,\n      \"digest\": \"20cca32c0fd5abdaae11f82e327b6456c248d13421be0b2966d9e7884aeb0305\"\n    }\n  ],\n  \"requiredCapabilities\": [\n    \"note.field.choice.v1\",\n    \"note.field.boolean.v1\",\n    \"note.field.number.v1\",\n    \"note.field.text.v1\"\n  ],\n  \"dataset\": {\n    \"name\": \"review-items\",\n    \"fields\": [\n      {\n        \"name\": \"State\",\n        \"kind\": \"choice\",\n        \"options\": [\n          \"진행\",\n          \"계획\"\n        ]\n      },\n      {\n        \"name\": \"Done\",\n        \"kind\": \"boolean\"\n      },\n      {\n        \"name\": \"Count\",\n        \"kind\": \"number\"\n      },\n      {\n        \"name\": \"Label\",\n        \"kind\": \"text\",\n        \"label\": \"Café\"\n      }\n    ]\n  }\n}\n"
        },
        {
          "reference": {
            "schemaId": "22222222-2222-2222-2222-222222222222",
            "version": 1,
            "digest": "4d4891751b5d9b86ea92afbdd02300dac31e139d4a69adcde28db2b43e83e0f9"
          },
          "definitionText": "{\n \"dialect\": \"wonffice.note-fields.v1\",\n \"scope\": {\n  \"tenantId\": \"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\",\n  \"workspaceId\": \"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb\"\n },\n \"schemaId\": \"22222222-2222-2222-2222-222222222222\",\n \"version\": 1,\n \"parent\": null,\n \"dependencies\": [],\n \"requiredCapabilities\": [\n  \"note.field.text.v1\"\n ],\n \"dataset\": {\n  \"name\": \"reference labels\",\n  \"fields\": [\n   {\n    \"name\": \"Label\",\n    \"kind\": \"text\",\n    \"label\": \"Café\"\n   }\n  ]\n }\n}\n"
        },
        {
          "reference": {
            "schemaId": "11111111-1111-1111-1111-111111111111",
            "version": 2,
            "digest": "c73df69758346deeb34cc3be23f7e0629aa9069907fb5293207e1faed4e416fd"
          },
          "definitionText": "{\n  \"dialect\": \"wonffice.note-fields.v1\",\n  \"scope\": {\n    \"tenantId\": \"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\",\n    \"workspaceId\": \"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb\"\n  },\n  \"schemaId\": \"11111111-1111-1111-1111-111111111111\",\n  \"version\": 2,\n  \"parent\": {\n    \"schemaId\": \"11111111-1111-1111-1111-111111111111\",\n    \"version\": 1,\n    \"digest\": \"0e35de697c2ce77c04c03ecd68344763d73d9656a4484b6824f6c0414917ed1a\"\n  },\n  \"dependencies\": [\n    {\n      \"schemaId\": \"22222222-2222-2222-2222-222222222222\",\n      \"version\": 2,\n      \"digest\": \"20cca32c0fd5abdaae11f82e327b6456c248d13421be0b2966d9e7884aeb0305\"\n    }\n  ],\n  \"requiredCapabilities\": [\n    \"note.field.choice.v1\",\n    \"note.field.boolean.v1\",\n    \"note.field.number.v1\",\n    \"note.field.text.v1\"\n  ],\n  \"dataset\": {\n    \"name\": \"review-items\",\n    \"fields\": [\n      {\n        \"name\": \"State\",\n        \"kind\": \"choice\",\n        \"options\": [\n          \"진행\",\n          \"계획\"\n        ]\n      },\n      {\n        \"name\": \"Done\",\n        \"kind\": \"boolean\"\n      },\n      {\n        \"name\": \"Count\",\n        \"kind\": \"number\"\n      },\n      {\n        \"name\": \"Label\",\n        \"kind\": \"text\",\n        \"label\": \"Café\"\n      },\n      {\n        \"name\": \"Owner\",\n        \"kind\": \"text\",\n        \"label\": \"담당자\"\n      }\n    ]\n  }\n}\n"
        }
      ]
    },
    "document": {
      "stype": "note",
      "attributes": {
        "title": "검토 자료 A",
        "pageId": "native2-note-A",
        "authoredTag": "preserve-A"
      },
      "metadata": {
        "sourceRevision": 7,
        "annotation": null,
        "labels": [
          "검토",
          "Café"
        ]
      },
      "content": [
        {
          "stype": "heading",
          "attributes": {
            "level": 2
          },
          "content": [
            {
              "stype": "inline-text",
              "text": "목표 A",
              "marks": [
                {
                  "stype": "bold",
                  "range": [
                    0,
                    2
                  ]
                }
              ]
            }
          ]
        },
        {
          "stype": "paragraph",
          "attributes": {
            "alignment": "left"
          },
          "metadata": {
            "source": "authored-A",
            "annotation": null
          },
          "content": [
            {
              "stype": "inline-text",
              "text": "Café 검토 A",
              "marks": [
                {
                  "stype": "italic",
                  "range": [
                    0,
                    5
                  ]
                }
              ]
            },
            {
              "stype": "inline-text",
              "text": " / marks 생략"
            },
            {
              "stype": "pageReference",
              "attributes": {
                "pageId": "native2-note-A",
                "title": "A 내부"
              }
            },
            {
              "stype": "pageReference",
              "attributes": {
                "pageId": "external-note-A",
                "title": "A 외부"
              }
            }
          ]
        },
        {
          "stype": "codeBlock",
          "attributes": {
            "language": "typescript"
          },
          "content": [
            {
              "stype": "inline-text",
              "text": "const total = 7;"
            }
          ]
        },
        {
          "stype": "bTable",
          "content": [
            {
              "stype": "bTableBody",
              "content": [
                {
                  "stype": "bTableRow",
                  "content": [
                    {
                      "stype": "bTableCell",
                      "content": [
                        {
                          "stype": "inline-text",
                          "text": "A cell",
                          "marks": []
                        }
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          "stype": "resources",
          "content": [
            {
              "stype": "dataset",
              "attributes": {
                "name": "review-items",
                "fields": [
                  {
                    "name": "State",
                    "kind": "choice",
                    "options": [
                      "진행",
                      "계획"
                    ]
                  },
                  {
                    "name": "Done",
                    "kind": "boolean"
                  },
                  {
                    "name": "Count",
                    "kind": "number"
                  },
                  {
                    "name": "Label",
                    "kind": "text",
                    "label": "Café"
                  },
                  {
                    "name": "Owner",
                    "kind": "text",
                    "label": "담당자"
                  }
                ],
                "rowIds": [
                  "row-A-2",
                  "row-A-1"
                ],
                "records": [
                  {
                    "State": "진행",
                    "Done": false,
                    "Count": 7,
                    "Label": "자료 A"
                  },
                  {
                    "Label": "값 생략 A"
                  }
                ]
              }
            },
            {
              "stype": "richText",
              "attributes": {
                "id": "row-A-2"
              },
              "metadata": {
                "note": null
              },
              "content": [
                {
                  "stype": "paragraph",
                  "content": [
                    {
                      "stype": "inline-text",
                      "text": "항목 본문 A",
                      "marks": [
                        {
                          "stype": "underline",
                          "range": [
                            0,
                            2
                          ]
                        }
                      ]
                    },
                    {
                      "stype": "pageReference",
                      "attributes": {
                        "pageId": "native2-note-A",
                        "title": "A 자료 내부"
                      }
                    },
                    {
                      "stype": "pageReference",
                      "attributes": {
                        "pageId": "external-note-A",
                        "title": "A 자료 외부"
                      }
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  },
  "COPY_A_ORACLE": {
    "format": "barocss-note",
    "version": 2,
    "savedAt": "authored stamp A / Café",
    "schemaBundle": {
      "bundleVersion": 1,
      "digestAlgorithm": "wonffice.canonical-json.sha256.v1",
      "selected": [
        {
          "schemaId": "11111111-1111-1111-1111-111111111111",
          "version": 1,
          "digest": "0e35de697c2ce77c04c03ecd68344763d73d9656a4484b6824f6c0414917ed1a"
        }
      ],
      "definitions": [
        {
          "reference": {
            "schemaId": "22222222-2222-2222-2222-222222222222",
            "version": 2,
            "digest": "20cca32c0fd5abdaae11f82e327b6456c248d13421be0b2966d9e7884aeb0305"
          },
          "definitionText": "{\n    \"dialect\": \"wonffice.note-fields.v1\",\n    \"scope\": {\n        \"tenantId\": \"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\",\n        \"workspaceId\": \"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb\"\n    },\n    \"schemaId\": \"22222222-2222-2222-2222-222222222222\",\n    \"version\": 2,\n    \"parent\": {\n        \"schemaId\": \"22222222-2222-2222-2222-222222222222\",\n        \"version\": 1,\n        \"digest\": \"4d4891751b5d9b86ea92afbdd02300dac31e139d4a69adcde28db2b43e83e0f9\"\n    },\n    \"dependencies\": [],\n    \"requiredCapabilities\": [\n        \"note.field.choice.v1\",\n        \"note.field.text.v1\"\n    ],\n    \"dataset\": {\n        \"name\": \"reference labels\",\n        \"fields\": [\n            {\n                \"name\": \"State\",\n                \"kind\": \"choice\",\n                \"options\": [\n                    \"검토\",\n                    \"초안\"\n                ]\n            },\n            {\n                \"name\": \"Label\",\n                \"kind\": \"text\",\n                \"label\": \"Café\"\n            }\n        ]\n    }\n}\n"
        },
        {
          "reference": {
            "schemaId": "11111111-1111-1111-1111-111111111111",
            "version": 1,
            "digest": "0e35de697c2ce77c04c03ecd68344763d73d9656a4484b6824f6c0414917ed1a"
          },
          "definitionText": "{\n  \"dialect\": \"wonffice.note-fields.v1\",\n  \"scope\": {\n    \"tenantId\": \"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\",\n    \"workspaceId\": \"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb\"\n  },\n  \"schemaId\": \"11111111-1111-1111-1111-111111111111\",\n  \"version\": 1,\n  \"parent\": null,\n  \"dependencies\": [\n    {\n      \"schemaId\": \"22222222-2222-2222-2222-222222222222\",\n      \"version\": 2,\n      \"digest\": \"20cca32c0fd5abdaae11f82e327b6456c248d13421be0b2966d9e7884aeb0305\"\n    }\n  ],\n  \"requiredCapabilities\": [\n    \"note.field.choice.v1\",\n    \"note.field.boolean.v1\",\n    \"note.field.number.v1\",\n    \"note.field.text.v1\"\n  ],\n  \"dataset\": {\n    \"name\": \"review-items\",\n    \"fields\": [\n      {\n        \"name\": \"State\",\n        \"kind\": \"choice\",\n        \"options\": [\n          \"진행\",\n          \"계획\"\n        ]\n      },\n      {\n        \"name\": \"Done\",\n        \"kind\": \"boolean\"\n      },\n      {\n        \"name\": \"Count\",\n        \"kind\": \"number\"\n      },\n      {\n        \"name\": \"Label\",\n        \"kind\": \"text\",\n        \"label\": \"Café\"\n      }\n    ]\n  }\n}\n"
        },
        {
          "reference": {
            "schemaId": "22222222-2222-2222-2222-222222222222",
            "version": 1,
            "digest": "4d4891751b5d9b86ea92afbdd02300dac31e139d4a69adcde28db2b43e83e0f9"
          },
          "definitionText": "{\n \"dialect\": \"wonffice.note-fields.v1\",\n \"scope\": {\n  \"tenantId\": \"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\",\n  \"workspaceId\": \"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb\"\n },\n \"schemaId\": \"22222222-2222-2222-2222-222222222222\",\n \"version\": 1,\n \"parent\": null,\n \"dependencies\": [],\n \"requiredCapabilities\": [\n  \"note.field.text.v1\"\n ],\n \"dataset\": {\n  \"name\": \"reference labels\",\n  \"fields\": [\n   {\n    \"name\": \"Label\",\n    \"kind\": \"text\",\n    \"label\": \"Café\"\n   }\n  ]\n }\n}\n"
        }
      ]
    },
    "document": {
      "stype": "note",
      "attributes": {
        "title": "검토 자료 A",
        "pageId": "native2-copy-A",
        "authoredTag": "preserve-A"
      },
      "metadata": {
        "sourceRevision": 7,
        "annotation": null,
        "labels": [
          "검토",
          "Café"
        ]
      },
      "content": [
        {
          "stype": "heading",
          "attributes": {
            "level": 2
          },
          "content": [
            {
              "stype": "inline-text",
              "text": "목표 A",
              "marks": [
                {
                  "stype": "bold",
                  "range": [
                    0,
                    2
                  ]
                }
              ]
            }
          ]
        },
        {
          "stype": "paragraph",
          "attributes": {
            "alignment": "left"
          },
          "metadata": {
            "source": "authored-A",
            "annotation": null
          },
          "content": [
            {
              "stype": "inline-text",
              "text": "Café 검토 A",
              "marks": [
                {
                  "stype": "italic",
                  "range": [
                    0,
                    5
                  ]
                }
              ]
            },
            {
              "stype": "inline-text",
              "text": " / marks 생략"
            },
            {
              "stype": "pageReference",
              "attributes": {
                "pageId": "native2-copy-A",
                "title": "A 내부"
              }
            },
            {
              "stype": "pageReference",
              "attributes": {
                "pageId": "external-note-A",
                "title": "A 외부"
              }
            }
          ]
        },
        {
          "stype": "codeBlock",
          "attributes": {
            "language": "typescript"
          },
          "content": [
            {
              "stype": "inline-text",
              "text": "const total = 7;"
            }
          ]
        },
        {
          "stype": "bTable",
          "content": [
            {
              "stype": "bTableBody",
              "content": [
                {
                  "stype": "bTableRow",
                  "content": [
                    {
                      "stype": "bTableCell",
                      "content": [
                        {
                          "stype": "inline-text",
                          "text": "A cell",
                          "marks": []
                        }
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          "stype": "resources",
          "content": [
            {
              "stype": "dataset",
              "attributes": {
                "name": "review-items",
                "fields": [
                  {
                    "name": "State",
                    "kind": "choice",
                    "options": [
                      "진행",
                      "계획"
                    ]
                  },
                  {
                    "name": "Done",
                    "kind": "boolean"
                  },
                  {
                    "name": "Count",
                    "kind": "number"
                  },
                  {
                    "name": "Label",
                    "kind": "text",
                    "label": "Café"
                  }
                ],
                "rowIds": [
                  "row-A-2",
                  "row-A-1"
                ],
                "records": [
                  {
                    "State": "진행",
                    "Done": false,
                    "Count": 7,
                    "Label": "자료 A"
                  },
                  {
                    "Label": "값 생략 A"
                  }
                ]
              }
            },
            {
              "stype": "richText",
              "attributes": {
                "id": "row-A-2"
              },
              "metadata": {
                "note": null
              },
              "content": [
                {
                  "stype": "paragraph",
                  "content": [
                    {
                      "stype": "inline-text",
                      "text": "항목 본문 A",
                      "marks": [
                        {
                          "stype": "underline",
                          "range": [
                            0,
                            2
                          ]
                        }
                      ]
                    },
                    {
                      "stype": "pageReference",
                      "attributes": {
                        "pageId": "native2-copy-A",
                        "title": "A 자료 내부"
                      }
                    },
                    {
                      "stype": "pageReference",
                      "attributes": {
                        "pageId": "external-note-A",
                        "title": "A 자료 외부"
                      }
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  }
};
const UNREGISTERED_NATIVE_FIXTURE = {
  "format": "barocss-note",
  "version": 2,
  "savedAt": "authored stamp A / Café",
  "schemaBundle": {
    "bundleVersion": 1,
    "digestAlgorithm": "wonffice.canonical-json.sha256.v1",
    "selected": [
      {
        "schemaId": "99999999-9999-4999-8999-999999999999",
        "version": 1,
        "digest": "81e0ecf0451997f737c78e2faf12680493d3c16a0455528a319c834214e9aa20"
      }
    ],
    "definitions": [
      {
        "reference": {
          "schemaId": "22222222-2222-2222-2222-222222222222",
          "version": 2,
          "digest": "20cca32c0fd5abdaae11f82e327b6456c248d13421be0b2966d9e7884aeb0305"
        },
        "definitionText": "{\n    \"dialect\": \"wonffice.note-fields.v1\",\n    \"scope\": {\n        \"tenantId\": \"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\",\n        \"workspaceId\": \"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb\"\n    },\n    \"schemaId\": \"22222222-2222-2222-2222-222222222222\",\n    \"version\": 2,\n    \"parent\": {\n        \"schemaId\": \"22222222-2222-2222-2222-222222222222\",\n        \"version\": 1,\n        \"digest\": \"4d4891751b5d9b86ea92afbdd02300dac31e139d4a69adcde28db2b43e83e0f9\"\n    },\n    \"dependencies\": [],\n    \"requiredCapabilities\": [\n        \"note.field.choice.v1\",\n        \"note.field.text.v1\"\n    ],\n    \"dataset\": {\n        \"name\": \"reference labels\",\n        \"fields\": [\n            {\n                \"name\": \"State\",\n                \"kind\": \"choice\",\n                \"options\": [\n                    \"검토\",\n                    \"초안\"\n                ]\n            },\n            {\n                \"name\": \"Label\",\n                \"kind\": \"text\",\n                \"label\": \"Café\"\n            }\n        ]\n    }\n}\n"
      },
      {
        "reference": {
          "schemaId": "99999999-9999-4999-8999-999999999999",
          "version": 1,
          "digest": "81e0ecf0451997f737c78e2faf12680493d3c16a0455528a319c834214e9aa20"
        },
        "definitionText": "{\n  \"dialect\": \"wonffice.note-fields.v1\",\n  \"scope\": {\n    \"tenantId\": \"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\",\n    \"workspaceId\": \"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb\"\n  },\n  \"schemaId\": \"99999999-9999-4999-8999-999999999999\",\n  \"version\": 1,\n  \"parent\": null,\n  \"dependencies\": [\n    {\n      \"schemaId\": \"22222222-2222-2222-2222-222222222222\",\n      \"version\": 2,\n      \"digest\": \"20cca32c0fd5abdaae11f82e327b6456c248d13421be0b2966d9e7884aeb0305\"\n    }\n  ],\n  \"requiredCapabilities\": [\n    \"note.field.choice.v1\",\n    \"note.field.boolean.v1\",\n    \"note.field.number.v1\",\n    \"note.field.text.v1\"\n  ],\n  \"dataset\": {\n    \"name\": \"review-items\",\n    \"fields\": [\n      {\n        \"name\": \"State\",\n        \"kind\": \"choice\",\n        \"options\": [\n          \"진행\",\n          \"계획\"\n        ]\n      },\n      {\n        \"name\": \"Done\",\n        \"kind\": \"boolean\"\n      },\n      {\n        \"name\": \"Count\",\n        \"kind\": \"number\"\n      },\n      {\n        \"name\": \"Label\",\n        \"kind\": \"text\",\n        \"label\": \"Café\"\n      }\n    ]\n  }\n}\n"
      },
      {
        "reference": {
          "schemaId": "22222222-2222-2222-2222-222222222222",
          "version": 1,
          "digest": "4d4891751b5d9b86ea92afbdd02300dac31e139d4a69adcde28db2b43e83e0f9"
        },
        "definitionText": "{\n \"dialect\": \"wonffice.note-fields.v1\",\n \"scope\": {\n  \"tenantId\": \"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\",\n  \"workspaceId\": \"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb\"\n },\n \"schemaId\": \"22222222-2222-2222-2222-222222222222\",\n \"version\": 1,\n \"parent\": null,\n \"dependencies\": [],\n \"requiredCapabilities\": [\n  \"note.field.text.v1\"\n ],\n \"dataset\": {\n  \"name\": \"reference labels\",\n  \"fields\": [\n   {\n    \"name\": \"Label\",\n    \"kind\": \"text\",\n    \"label\": \"Café\"\n   }\n  ]\n }\n}\n"
      }
    ]
  },
  "document": {
    "stype": "note",
    "attributes": {
      "title": "검토 자료 A",
      "pageId": "native2-note-A",
      "authoredTag": "preserve-A"
    },
    "metadata": {
      "sourceRevision": 7,
      "annotation": null,
      "labels": [
        "검토",
        "Café"
      ]
    },
    "content": [
      {
        "stype": "heading",
        "attributes": {
          "level": 2
        },
        "content": [
          {
            "stype": "inline-text",
            "text": "목표 A",
            "marks": [
              {
                "stype": "bold",
                "range": [
                  0,
                  2
                ]
              }
            ]
          }
        ]
      },
      {
        "stype": "paragraph",
        "attributes": {
          "alignment": "left"
        },
        "metadata": {
          "source": "authored-A",
          "annotation": null
        },
        "content": [
          {
            "stype": "inline-text",
            "text": "Café 검토 A",
            "marks": [
              {
                "stype": "italic",
                "range": [
                  0,
                  5
                ]
              }
            ]
          },
          {
            "stype": "inline-text",
            "text": " / marks 생략"
          },
          {
            "stype": "pageReference",
            "attributes": {
              "pageId": "native2-note-A",
              "title": "A 내부"
            }
          },
          {
            "stype": "pageReference",
            "attributes": {
              "pageId": "external-note-A",
              "title": "A 외부"
            }
          }
        ]
      },
      {
        "stype": "codeBlock",
        "attributes": {
          "language": "typescript"
        },
        "content": [
          {
            "stype": "inline-text",
            "text": "const total = 7;"
          }
        ]
      },
      {
        "stype": "bTable",
        "content": [
          {
            "stype": "bTableBody",
            "content": [
              {
                "stype": "bTableRow",
                "content": [
                  {
                    "stype": "bTableCell",
                    "content": [
                      {
                        "stype": "inline-text",
                        "text": "A cell",
                        "marks": []
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      },
      {
        "stype": "resources",
        "content": [
          {
            "stype": "dataset",
            "attributes": {
              "name": "review-items",
              "fields": [
                {
                  "name": "State",
                  "kind": "choice",
                  "options": [
                    "진행",
                    "계획"
                  ]
                },
                {
                  "name": "Done",
                  "kind": "boolean"
                },
                {
                  "name": "Count",
                  "kind": "number"
                },
                {
                  "name": "Label",
                  "kind": "text",
                  "label": "Café"
                }
              ],
              "rowIds": [
                "row-A-2",
                "row-A-1"
              ],
              "records": [
                {
                  "State": "진행",
                  "Done": false,
                  "Count": 7,
                  "Label": "자료 A"
                },
                {
                  "Label": "값 생략 A"
                }
              ]
            }
          },
          {
            "stype": "richText",
            "attributes": {
              "id": "row-A-2"
            },
            "metadata": {
              "note": null
            },
            "content": [
              {
                "stype": "paragraph",
                "content": [
                  {
                    "stype": "inline-text",
                    "text": "항목 본문 A",
                    "marks": [
                      {
                        "stype": "underline",
                        "range": [
                          0,
                          2
                        ]
                      }
                    ]
                  },
                  {
                    "stype": "pageReference",
                    "attributes": {
                      "pageId": "native2-note-A",
                      "title": "A 자료 내부"
                    }
                  },
                  {
                    "stype": "pageReference",
                    "attributes": {
                      "pageId": "external-note-A",
                      "title": "A 자료 외부"
                    }
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  }
};
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const stageOnly=process.argv[2]==='--stage-only';
const originalBaseline=process.argv[2]==='--original-native2-baseline';
const mcpEnabled=process.argv.includes('--mcp');
if(stageOnly && !process.argv[3])throw new Error('Stage destination is required');
const evidence=stageOnly?resolve(process.argv[3]):process.env.SCHEMA_SERVER_EVIDENCE;
if(stageOnly)assert.equal(existsSync(evidence),false,'Refuse existing artifact destination');
if(!evidence)throw new Error('SCHEMA_SERVER_EVIDENCE is required');
assert.equal(existsSync(evidence),false,'Fresh producer evidence required');
mkdirSync(evidence,{recursive:true,mode:0o700});
const privateRoot=stageOnly?undefined:mkdtempSync('/private/tmp/schema-n2-'),socket=privateRoot?join(privateRoot,'socket'):undefined,data=privateRoot?join(privateRoot,'data'):undefined;
if(!stageOnly){chmodSync(privateRoot,0o700);mkdirSync(socket,{mode:0o700});}
const bin=stageOnly?undefined:process.env.PG_BIN;
if(!stageOnly)assert.ok(bin,'Explicit owned PG_BIN required');
const httpPort=14595,jwksPort=18595,pgPort=14596,issuer=`http://127.0.0.1:${jwksPort}/realm`;
const origin=`http://127.0.0.1:${httpPort}`;
const ids={tenant:'11111111-1111-4111-8111-111111111111',workspace:'22222222-2222-4222-8222-222222222222',schema:'33333333-3333-4333-8333-333333333333',otherSchema:'66666666-6666-4666-8666-666666666666',foreignTenant:'77777777-7777-4777-8777-777777777777',foreignWorkspace:'88888888-8888-4888-8888-888888888888'};
const hash=text=>createHash('sha256').update(text,'utf8').digest('hex');
const report={kind:'actual-independent-compiled-schema-http-private-postgres-controlled-signed-jwks',status:'incomplete',checks:[],notClaimed:['genuine browser/OIDC login',...(mcpEnabled?['LLM/native UI']:['MCP']),'full495/Goal/alpha/release']};
const lease={runId:randomUUID(),uid:process.getuid(),controllerPid:process.pid,root:privateRoot,socket,data,httpPort,jwksPort,pgPort,state:'prepared',qualification:'Fresh exclusive Unix PG/own HTTP+JWKS; no shared listener or data takeover'};
const saveLease=()=>{if(!stageOnly)writeFileSync(join(evidence,'runtime-lease.json'),JSON.stringify(lease,null,2),{mode:0o600});};
const save=()=>writeFileSync(join(evidence,'server-proof.json'),JSON.stringify(report,null,2),{mode:0o600});
const check=async(name,work)=>{await work();report.checks.push({name,status:'passed'});save();console.log(JSON.stringify({check:name,result:'passed'}));};
const run=(name,args)=>execFileSync(join(bin,name),args,{encoding:'utf8',stdio:'pipe'});
const cfg=(user,database='schema_test')=>({host:socket,port:pgPort,user,database});
const startPg=()=>{run('pg_ctl',['-D',data,'-l',join(privateRoot,'postgres.log'),'-o',`-k ${socket} -h '' -p ${pgPort}`,'-w','start']);
 const lines=readFileSync(join(data,'postmaster.pid'),'utf8').trim().split('\n');assert.equal(realpathSync(lines[1]),realpathSync(data));lease.postmasterPid=Number(lines[0]);assert.ok(lease.postmasterPid>0);pgStarted=true;lease.state='running';saveLease();};
const stopPg=()=>{const lines=readFileSync(join(data,'postmaster.pid'),'utf8').trim().split('\n');assert.equal(realpathSync(lines[1]),realpathSync(data));assert.equal(Number(lines[0]),lease.postmasterPid);run('pg_ctl',['-D',data,'-m','fast','-w','stop']);pgStarted=false;lease.state='stopped-retained';saveLease();};
const closeConnections=async()=>{for(const pool of pools.splice(0))await pool.end();for(const client of clients.splice(0))await client.end();};
const clients=[],pools=[];let pgStarted=false,jwks,child,stage,forwarder;const logs=[];
async function connect(user,database){const c=new pg.Client(cfg(user,database));await c.connect();clients.push(c);return c;}
function graph(directory){
  const files={},links={},visited=new Set();
  const walk=path=>{
    const real=realpathSync(path),stat=statSync(path);
    if(real!==path)links[path]=real;
    if(stat.isDirectory()){if(visited.has(real))return;visited.add(real);for(const name of readdirSync(path))walk(join(path,name));}
    else if(stat.isFile())files[real]=hash(readFileSync(path));
  };walk(resolve(directory));return {files,links};
}
function stageRuntime(target) {
  mkdirSync(target,{recursive:true,mode:0o700});const packages=new Map(),projection=[];
  function link(path,to){mkdirSync(dirname(path),{recursive:true});const rel=relative(dirname(path),to);symlinkSync(rel,path,'dir');}
  function external(name,from){
    for(const parent of [from,...parents(from)]){const path=join(parent,'node_modules',name);if(existsSync(join(path,'package.json')))return copyPackage(realpathSync(path));}
    throw new Error(`Locked runtime dependency unavailable: ${name}`);
  }
  function* parents(path){let previous;while(path!==previous){previous=path;path=dirname(path);yield path;}}
  function copyPackage(source){
    if(packages.has(source))return packages.get(source);const manifest=JSON.parse(readFileSync(join(source,'package.json'),'utf8'));
    const out=join(target,'.runtime-packages',`${manifest.name.replaceAll('/','_')}@${manifest.version}-${hash(source).slice(0,8)}`);
    packages.set(source,out);mkdirSync(out,{recursive:true});
    for(const entry of readdirSync(source))if(entry!=='node_modules')cpSync(join(source,entry),join(out,entry),{recursive:true,dereference:true});
    projection.push({name:manifest.name,version:manifest.version,sourcePackage:join(source,'package.json'),sourcePackageHash:hash(readFileSync(join(source,'package.json'))),kind:'locked-external-copy'});
    for(const dependency of Object.keys(manifest.dependencies??{}))link(join(out,'node_modules',dependency),external(dependency,source));
    for(const dependency of Object.keys(manifest.peerDependencies??{})){
      if(existsSync(join(out,'node_modules',dependency)))continue;
      try{link(join(out,'node_modules',dependency),external(dependency,source));}
      catch(error){if(!manifest.peerDependenciesMeta?.[dependency]?.optional)throw error;}
    }
    for(const dependency of Object.keys(manifest.optionalDependencies??{})){try{if(!existsSync(join(out,'node_modules',dependency)))link(join(out,'node_modules',dependency),external(dependency,source));}catch{/* Absent optional package is not installed or executed. */}}
    return out;
  }
  const entries=[
    ['packages/schema',['registry-contract.js'],{'./registry-contract':'./dist/registry-contract.js'},{}],
    ['apps/office-service',['schema-registry-store.js','membership-store.js','tenant-store.js','document-store.js'],{'./schema-registry-store':'./dist/schema-registry-store.js','./membership-store':'./dist/membership-store.js','./document-store':'./dist/document-store.js'},{'@barocss/schema':'workspace:^','@barocss/office-note-file':'workspace:^'}],
    ['apps/office-api',['oidc.js','auth-config.js'],{'./oidc':'./dist/oidc.js','./auth-config':'./dist/auth-config.js'},{jose:'6.2.12'}],
    ['packages/office-note-file',null,{'.':'./dist/index.js'},{}]
  ];
  const workspace=new Map();
  for(const [name,files,exports,dependencies] of entries){
    const source=join(root,name),original=JSON.parse(readFileSync(join(source,'package.json'),'utf8'));
    const out=join(target,'.runtime-packages',original.name.replaceAll('/','_'));workspace.set(original.name,out);mkdirSync(join(out,'dist'),{recursive:true});
    if(files)for(const file of files)cpSync(join(source,'dist',file),join(out,'dist',file));else cpSync(join(source,'dist'),join(out,'dist'),{recursive:true});
    writeFileSync(join(out,'package.json'),JSON.stringify({name:original.name,version:original.version,type:'module',exports,dependencies},null,2));
    projection.push({name:original.name,sourcePackage:join(source,'package.json'),sourcePackageHash:hash(readFileSync(join(source,'package.json'))),kind:'compiled-runtime-subpath-projection',exports,dependencies,files});
  }
  for(const out of workspace.values()){const manifest=JSON.parse(readFileSync(join(out,'package.json'),'utf8'));
    for(const dependency of Object.keys(manifest.dependencies??{}))link(join(out,'node_modules',dependency),workspace.get(dependency)??external(dependency,join(root,'apps/schema-server')));
  }
  cpSync(join(root,'apps/schema-server/dist'),join(target,'dist'),{recursive:true});
  const app=JSON.parse(readFileSync(join(root,'apps/schema-server/package.json'),'utf8'));
  const projectedApp={name:app.name,version:app.version,type:'module',scripts:{start:'node dist/main.js',...(existsSync(join(root,'apps/schema-server/dist/mcp-main.js'))?{'start:mcp':'node dist/mcp-main.js'}:{})},dependencies:app.dependencies};
  writeFileSync(join(target,'package.json'),JSON.stringify(projectedApp,null,2));
  projection.push({name:app.name,sourcePackage:join(root,'apps/schema-server/package.json'),sourcePackageHash:hash(readFileSync(join(root,'apps/schema-server/package.json'))),kind:'compiled-app-runtime-projection',projected:projectedApp});
  for(const dependency of Object.keys(app.dependencies))link(join(target,'node_modules',dependency),workspace.get(dependency)??external(dependency,join(root,'apps/schema-server')));
  cpSync(join(root,'apps/schema-server/README.md'),join(target,'README.md'));
  if(existsSync(join(root,'apps/schema-server/MCP.md')))cpSync(join(root,'apps/schema-server/MCP.md'),join(target,'MCP.md'));
  if(mcpEnabled){assert.ok(existsSync(join(target,'dist/mcp-main.js')));assert.ok(existsSync(join(target,'dist/mcp-bundle-reader.js')));assert.ok(existsSync(join(target,'MCP.md')));}
  writeFileSync(join(evidence,'runtime-package-projection.json'),JSON.stringify(projection,null,2));
}
let stageBefore;
if(!stageOnly){lease.pg=Object.fromEntries(['initdb','pg_ctl','postgres','pg_config','pg_dump','pg_restore'].map(name=>[name,{path:realpathSync(join(bin,name)),sha256:hash(readFileSync(join(bin,name))),version:run(name,['--version']).trim()}]));saveLease();}
async function startServer(policyFile,label,documentPolicyFile){
  const log=join(evidence,`${label}.log`);logs.push(log);const out=createWriteStream(log,{mode:0o600});
  const env={...process.env,NODE_DEBUG:'esm,module',SCHEMA_SERVER_HOST:'127.0.0.1',SCHEMA_SERVER_PORT:String(httpPort),SCHEMA_SERVER_POLICY_FILE:policyFile,
    SCHEMA_SERVER_OIDC_ISSUER:issuer,SCHEMA_SERVER_OIDC_JWKS_URL:`http://127.0.0.1:${jwksPort}/keys`,SCHEMA_SERVER_OIDC_AUDIENCE:'schema-test',
    SCHEMA_SERVER_DATABASE_URL:`postgresql:///schema_test?host=${encodeURIComponent(socket)}&port=${pgPort}&user=wonffice_app`};
  delete env.SCHEMA_SERVER_NOTE_DOCUMENT_POLICY_FILE;if(documentPolicyFile)env.SCHEMA_SERVER_NOTE_DOCUMENT_POLICY_FILE=documentPolicyFile;
  child=spawn(process.execPath,[join(stage,'dist/main.js')],{cwd:stage,env,stdio:['ignore','pipe','pipe']});
  let outputText='';child.stdout.on('data',bytes=>{outputText+=bytes.toString();});
  child.stdout.pipe(out);child.stderr.pipe(out);lease.serverPid=child.pid;lease.serverStage=stage;saveLease();
  const exit=new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));
  child.proofExit=exit;child.proofLog=out;
  for(let n=0;n<100;n++){
    if(child.exitCode!==null)throw new Error('Compiled server exited before readiness');
    try{if(outputText.includes('schema_server_listening')&&(await fetch(origin+'/health/ready')).status===200)return;}catch{/* The bounded startup poll or already-closed resource may refuse; final cleanup is tracked separately. */}
    await new Promise(resolve=>setTimeout(resolve,50));
  }
  throw new Error('Compiled server did not become ready');
}
async function stopServer(){
  if(!child)return;
  const current=child;child=undefined;current.kill('SIGTERM');
  let timer;let result;
  try{result=await Promise.race([current.proofExit,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Shutdown deadline exceeded')),12000);})]);}finally{clearTimeout(timer);}
  assert.deepEqual(result,{code:0,signal:null});await new Promise(resolve=>current.proofLog.end(resolve));
}
const definition=(schemaId=ids.schema,version=1,parent=null,dependencies=[],number=false)=>({dialect:'wonffice.note-fields.v1',scope:{tenantId:ids.tenant,workspaceId:ids.workspace},schemaId,version,parent,dependencies,requiredCapabilities:[number?'note.field.number.v1':'note.field.text.v1'],dataset:{name:number?'Numbers':'Tasks',fields:[{name:number?'Amount':'Title',kind:number?'number':'text'}]}});
const base=`/v1/tenants/${ids.tenant}/workspaces/${ids.workspace}`;
let owner,token,policyFile,observer;
const send=async(method,path,body,who='writer')=>{
 const response=await fetch(origin+path,{method,headers:{authorization:`Bearer ${await token(who)}`,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 return {status:response.status,body:await response.json()};
};
const register=(value,key,who='writer',text=JSON.stringify(value,null,2))=>send('PUT',base+`/schemas/${value.schemaId}/versions/${value.version}`,{definitionText:text,idempotencyKey:key},who);
let mcpSerial=0;
const mcpResources=[];
async function withMcp(bearer,work){
  const label=`mcp-child-${++mcpSerial}`,log=join(evidence,label+'.log'),out=createWriteStream(log,{mode:0o600});logs.push(log);
  const transport=new StdioClientTransport({command:process.execPath,args:[join(stage,'dist/mcp-main.js')],cwd:stage,
    env:{SCHEMA_SERVER_MCP_BASE_URL:origin,...(bearer?{SCHEMA_SERVER_MCP_BEARER_TOKEN:bearer}:{}),NODE_DEBUG:'esm,module'},stderr:'pipe'});
  const client=new Client({name:'schema-private-pg-proof',version:'1.0.0'});const item={label,start:new Date().toISOString(),entry:join(stage,'dist/mcp-main.js'),controlledSignedJwksPrivatePg:true};mcpResources.push(item);
  try{
    await client.connect(transport);item.pid=transport.pid;assert.ok(item.pid>0);transport.stderr?.pipe(out);
    item.protocol=client.getNegotiatedProtocolVersion();assert.equal(item.protocol,'2025-11-25');
    assert.deepEqual((await client.listTools()).tools.map(tool=>tool.name),['get_schema_bundle','register_schema']);
    lease.mcpChildren=mcpResources;saveLease();return await work(client);
  }finally{
    await client.close();await new Promise(resolve=>out.end(resolve));
    if(item.pid){const point=execFileSync('ps',['-axo','pid='],{encoding:'utf8'}).split('\n').map(v=>Number(v.trim()));assert.equal(point.includes(item.pid),false);}
    item.end=new Date().toISOString();item.closed=true;lease.mcpChildren=mcpResources;saveLease();
  }
}
async function mcpTool(client,tenantId,documentId){
  const result=await client.callTool({name:'get_schema_bundle',arguments:{tenantId,documentId}});
  assert.ok(Array.isArray(result.content)&&result.content.length===1&&result.content[0].type==='text');
  return {isError:result.isError===true,body:JSON.parse(result.content[0].text)};
}

if(stageOnly){
  stageRuntime(evidence);const binding=graph(evidence);
  writeFileSync(join(evidence,'artifact-binding.json'),JSON.stringify(binding,null,2));
  console.log(JSON.stringify({event:'schema_runtime_staged',destination:evidence,files:Object.keys(binding.files).length}));
}else{
try{
  assert.equal(process.version,'v22.22.0');
  const {migrate}=await import('../../office-service/dist/migrate.js');
  const {applyMembershipChange}=await import('../../office-service/dist/membership-admin.js');
  const {DocumentStore}=await import('../../office-service/dist/document-store.js');
  stage=process.env.SCHEMA_SERVER_ARTIFACT?resolve(process.env.SCHEMA_SERVER_ARTIFACT):join(evidence,'staged-runtime');
  if(process.env.SCHEMA_SERVER_ARTIFACT){
    const declared=JSON.parse(readFileSync(join(stage,'artifact-binding.json'),'utf8'));const actual=graph(stage);delete actual.files[realpathSync(join(stage,'artifact-binding.json'))];assert.deepEqual(actual,declared);
  }else stageRuntime(stage);
  assert.ok(existsSync(join(stage,'dist/main.js')));assert.equal(existsSync(join(stage,'src')),false);
  stageBefore=graph(stage);writeFileSync(join(evidence,'runtime-stage-before.json'),JSON.stringify(stageBefore,null,2));
  run('initdb',['-D',data,'-U','schema_test_admin','--auth-local=trust','--auth-host=reject','--no-locale','--encoding=UTF8']);
  startPg();
  const admin=await connect('schema_test_admin','postgres');
  await admin.query(`CREATE ROLE wonffice_owner LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
    CREATE ROLE wonffice_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
    CREATE ROLE wonffice_backup LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT BYPASSRLS`);
  await admin.query("ALTER ROLE wonffice_app SET lock_timeout='5s';ALTER ROLE wonffice_app SET log_min_messages='notice'");
  await admin.query('CREATE DATABASE schema_test OWNER wonffice_owner');
  owner=await connect('wonffice_owner');const applied=await migrate(owner);assert.equal(applied.at(-1),'0016_schema_registry');
  const {privateKey,publicKey}=await generateKeyPair('RS256');const publicJwk={...await exportJWK(publicKey),kid:'schema-test-key',alg:'RS256',use:'sig'};
  jwks=createServer((request,response)=>{if(request.url==='/keys'){response.setHeader('content-type','application/json');response.end(JSON.stringify({keys:[publicJwk]}));}else{response.statusCode=404;response.end();}});
  await new Promise((resolve,reject)=>{jwks.once('error',reject);jwks.listen(jwksPort,'127.0.0.1',resolve);});
  token=async(subject,options={})=>new SignJWT({typ:options.typ??'Bearer'}).setProtectedHeader({alg:'RS256',kid:'schema-test-key'}).setIssuer(issuer).setAudience(options.audience??'schema-test').setSubject(subject).setIssuedAt().setExpirationTime(options.expiration??'5m').sign(privateKey);
  for(const [subject,role] of [['writer','editor'],['viewer','viewer']]){
    if(subject==='writer')await applyMembershipChange(owner,{action:'bootstrap_owner',tenantId:ids.tenant,tenantName:'Schema Alpha',issuer,subject:'operator',approvalRef:'schema-test-owner'});
    await applyMembershipChange(owner,{action:'grant',tenantId:ids.tenant,issuer,subject,role,approvalRef:`schema-test-${subject}`});
  }
  await applyMembershipChange(owner,{action:'bootstrap_owner',tenantId:ids.foreignTenant,tenantName:'Schema Foreign',issuer,subject:'foreign',approvalRef:'schema-test-foreign'});
  await owner.query('INSERT INTO wonffice.workspaces(tenant_id,id,name) VALUES($1,$2,$3),($4,$5,$6)',[ids.tenant,ids.workspace,'Schema workspace',ids.foreignTenant,ids.foreignWorkspace,'Foreign workspace']);
  const writerId=(await owner.query('SELECT id FROM wonffice.identities WHERE issuer=$1 AND subject=$2',[issuer,'writer'])).rows[0].id;
  const pool=new pg.Pool({...cfg('wonffice_app'),max:2});pools.push(pool);
  const source={stype:'note',attributes:{title:'Preserved legacy',pageId:'source-page'},content:[{stype:'paragraph',content:[{stype:'inline-text',text:'Exact legacy body',marks:[{stype:'bold',range:[0,5]}]},{stype:'pageReference',attributes:{pageId:'source-page',title:'Self'}}]}]};
  const sourceText=JSON.stringify({format:'barocss-note',version:1,savedAt:'authored old stamp',document:source},null,2)+'\n';
  const original=await new DocumentStore(pool).create({issuer,subject:'writer'},ids.tenant,{workspaceId:ids.workspace,product:'note',title:'Preserved legacy',fileFormat:'barocss-note',fileVersion:1,snapshotText:sourceText,idempotencyKey:'legacy-source',importMode:'new-page-copy'});
  const expectedNative=structuredClone(source);expectedNative.attributes.pageId=original.document.pageId;expectedNative.content[0].content[1].attributes.pageId=original.document.pageId;
  const expectedNativeText=JSON.stringify({format:'barocss-note',version:1,savedAt:'authored old stamp',document:expectedNative},null,2)+'\n';assert.equal(original.snapshotText,expectedNativeText);
  const policy=[{tenantId:ids.tenant,workspaceId:ids.workspace,readRoles:['editor','viewer'],registerRoles:['editor'],capabilities:['note.field.text.v1','note.field.number.v1','note.field.boolean.v1','note.field.choice.v1']}];
  policyFile=join(evidence,'operator-policy.json');writeFileSync(policyFile,JSON.stringify(policy),{mode:0o600});
  if(originalBaseline){
    const f=HTTP_NATIVE_FIXTURES.SOURCE_A,nativeTenant='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',nativeWorkspace='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    await applyMembershipChange(owner,{action:'bootstrap_owner',tenantId:nativeTenant,tenantName:'Native transport baseline',issuer,subject:'native-operator',approvalRef:'native-baseline-owner'});
    await applyMembershipChange(owner,{action:'grant',tenantId:nativeTenant,issuer,subject:'writer-a',role:'editor',approvalRef:'native-baseline-writer'});
    await owner.query('INSERT INTO wonffice.workspaces(tenant_id,id,name) VALUES($1,$2,$3)',[nativeTenant,nativeWorkspace,'Native baseline workspace']);
    const {SchemaRegistryStore}=await import('../../office-service/dist/schema-registry-store.js');
    const nativePolicy={tenantId:nativeTenant,workspaceId:nativeWorkspace,readRoles:['editor','viewer'],registerRoles:['editor'],capabilities:policy[0].capabilities};
    const registry=new SchemaRegistryStore(pool,[nativePolicy]);
    for(const [schemaId,version] of [['22222222-2222-2222-2222-222222222222',1],['22222222-2222-2222-2222-222222222222',2],['11111111-1111-1111-1111-111111111111',1]]){
      const entry=f.schemaBundle.definitions.find(e=>e.reference.schemaId===schemaId&&e.reference.version===version);assert.ok(entry);
      await registry.register({issuer,subject:'writer-a'},nativeTenant,nativeWorkspace,schemaId,version,{definitionText:entry.definitionText,idempotencyKey:'baseline-register-'+schemaId+'-'+version});
    }
    const sourceRaw=JSON.stringify(f,null,2)+'\n';
    const seeded=await new DocumentStore(pool,{noteSchemaPolicy:[{...nativePolicy,preserveRoles:['editor'],adoptRoles:['editor']}]}).create({issuer,subject:'writer-a'},nativeTenant,{workspaceId:nativeWorkspace,product:'note',title:'Baseline imported native2',fileFormat:'barocss-note',fileVersion:2,snapshotText:sourceRaw,importMode:'new-page-copy',idempotencyKey:'baseline-native2-seed'});
    const expectedCopy=structuredClone(HTTP_NATIVE_FIXTURES.COPY_A_ORACLE);
    for(const path of [['document','attributes','pageId'],['document','content',1,'content',2,'attributes','pageId'],['document','content',4,'content',1,'content',0,'content',1,'attributes','pageId']]){
      let value=expectedCopy;for(const key of path.slice(0,-1))value=value[key];value[path.at(-1)]=seeded.document.pageId;
    }
    const expectedCopyRaw=JSON.stringify({format:expectedCopy.format,version:expectedCopy.version,schemaBundle:expectedCopy.schemaBundle,document:expectedCopy.document,...(Object.hasOwn(expectedCopy,'savedAt')?{savedAt:expectedCopy.savedAt}:{})},null,2)+'\n';assert.equal(seeded.snapshotText,expectedCopyRaw);assert.equal(seeded.document.snapshotHash,hash(expectedCopyRaw));assert.equal(seeded.document.fileVersion,2);
    policy.push(nativePolicy);writeFileSync(policyFile,JSON.stringify(policy),{mode:0o600});
    report.nativeBaseline={seededVia:'direct actual service trusted principal fixture, NOT HTTP create',tenantId:nativeTenant,workspaceId:nativeWorkspace,documentId:seeded.document.documentId};
    await startServer(policyFile,'server-first');
    await check('original compiled main new native2 routes404 and authenticated legacy native2 bundle422 without effects',async()=>{
      const sql=async()=>(await owner.query('SELECT d.*,s.snapshot_text,s.snapshot_hash,s.revision,s.file_version FROM wonffice.documents d JOIN wonffice.document_snapshots s ON s.document_id=d.id AND s.tenant_id=d.tenant_id WHERE d.id=$1',[seeded.document.documentId])).rows;
      const before=await sql();
      const missing=await send('GET',`/v1/tenants/${nativeTenant}/note-native2/documents/${seeded.document.documentId}`,undefined,'writer-a');assert.equal(missing.status,404);
      const unsupported=await send('GET',`/v1/tenants/${nativeTenant}/workspaces/${nativeWorkspace}/documents/${seeded.document.documentId}/schema-bundle`,undefined,'writer-a');assert.equal(unsupported.status,422);assert.equal(unsupported.body.status,'unsupported_native_format');
      assert.deepEqual(await sql(),before);writeFileSync(join(evidence,'original-native2-baseline.json'),JSON.stringify({missing,unsupported,before,qualification:'Signed token against404 is not businessauth proof; existing legacy path authenticated refusal, seeded imported fixture, production original unchanged'},null,2));
    });
  }else await startServer(policyFile,'server-first');

  await check('own compiled staged process/live/actual DB readiness; no source TypeScript entry',async()=>{
    assert.equal((await fetch(origin+'/health/live')).status,200);assert.equal((await fetch(origin+'/health/ready')).status,200);
  });
  const value=definition(),text=JSON.stringify(value,null,2);
  const canonical=`{"dataset":{"fields":[{"kind":"text","name":"Title"}],"name":"Tasks"},"dependencies":[],"dialect":"wonffice.note-fields.v1","parent":null,"requiredCapabilities":["note.field.text.v1"],"schemaId":"${ids.schema}","scope":{"tenantId":"${ids.tenant}","workspaceId":"${ids.workspace}"},"version":1}`;
  let first,second,dependent;
  await check('authenticated immutable registration/original text/independent digest/actor-scoped exact retry',async()=>{
    first=await register(value,'first');assert.equal(first.status,200);assert.equal(first.body.record.definitionText,text);assert.deepEqual(first.body.record.definition,value);assert.equal(first.body.record.canonicalText,canonical);assert.equal(first.body.record.digest,hash(canonical));assert.equal(first.body.requesterIdentityId,writerId);assert.equal(first.body.record.actorIdentityId,writerId);
    assert.equal(first.body.requestHash,hash(JSON.stringify(['schema-register-v1',ids.tenant,ids.workspace,ids.schema,1,text])));
    assert.deepEqual((await register(value,'first')).body,first.body);assert.deepEqual((await send('GET',base+'/schema-receipts/first')).body,first.body);
    const altered=await register(value,'first','writer',' '+text);assert.equal(altered.status,409);assert.equal(altered.body.status,'key_reuse');
    const conflict=await register({...value,dataset:{...value.dataset,name:'Conflict'}},'conflict');assert.equal(conflict.status,409);assert.equal(conflict.body.status,'immutable_version_conflict');
    const equivalent=await register(value,'equivalent','writer',JSON.stringify(value));assert.equal(equivalent.status,200);assert.equal(equivalent.body.record.definitionText,text);
  });
  await check('exact parent and complete immutable dependency reads; missing/cycle/unsupported reject atomically',async()=>{
    const ref={schemaId:ids.schema,version:1,digest:hash(canonical)};
    second=await register(definition(ids.schema,2,ref),'second');assert.equal(second.status,200);assert.deepEqual(second.body.dependencies,[first.body.record]);
    dependent=await register(definition(ids.otherSchema,1,null,[ref],true),'dependent');assert.equal(dependent.status,200);assert.deepEqual(dependent.body.dependencies,[first.body.record]);
    const get=await send('GET',base+`/schemas/${ids.otherSchema}/versions/1`);assert.deepEqual(get.body,{record:dependent.body.record,dependencies:[first.body.record]});
    const counts=await owner.query('SELECT (SELECT count(*)::int FROM wonffice.schema_versions) AS versions,(SELECT count(*)::int FROM wonffice.schema_registry_receipts) AS receipts');
    for(const [key,invalid] of [['missing',definition('99999999-9999-4999-8999-999999999999',1,null,[{...ref,schemaId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}])],['cycle',definition('99999999-9999-4999-8999-999999999999',1,null,[{...ref,schemaId:'99999999-9999-4999-8999-999999999999'}])],['unsupported',{...definition('99999999-9999-4999-8999-999999999999'),validator:'execute()'}]])assert.equal((await register(invalid,key)).status,422);
    assert.deepEqual((await owner.query('SELECT (SELECT count(*)::int FROM wonffice.schema_versions) AS versions,(SELECT count(*)::int FROM wonffice.schema_registry_receipts) AS receipts')).rows,counts.rows);
  });
  await check('real current writer/viewer/foreign/invalid-token authorization and preserved legacy native',async()=>{
    assert.equal((await register(value,'viewer-denied','viewer')).status,403);assert.equal((await send('GET',base+`/schemas/${ids.schema}/versions/1`,undefined,'viewer')).status,200);
    assert.equal((await send('GET',base+'/schema-receipts/first',undefined,'viewer')).status,403);assert.equal((await send('GET',base+`/schemas/${ids.schema}/versions/1`,undefined,'foreign')).status,403);
    const bad=await fetch(origin+base+`/schemas/${ids.schema}/versions/1`,{headers:{authorization:`Bearer ${await token('writer',{typ:'ID'})}`}});assert.equal(bad.status,401);
    const legacy=await send('GET',base+`/documents/${original.document.documentId}/schema-bundle`);assert.deepEqual(legacy.body,{status:'legacy_unpinned',documentId:original.document.documentId,documentRevision:1,snapshotHash:hash(expectedNativeText),nativeFormat:{format:'barocss-note',version:1}});
    assert.equal((await owner.query('SELECT snapshot_text FROM wonffice.document_snapshots WHERE tenant_id=$1 AND document_id=$2',[ids.tenant,original.document.documentId])).rows[0].snapshot_text,expectedNativeText);
  });
  await check('current revocation denies record and fixed receipt without a new effect',async()=>{
    await applyMembershipChange(owner,{action:'revoke',tenantId:ids.tenant,issuer,subject:'writer',role:'editor',approvalRef:'schema-test-revoke'});
    assert.equal((await register(value,'first')).status,403);assert.equal((await send('GET',base+'/schema-receipts/first')).status,403);
    await applyMembershipChange(owner,{action:'grant',tenantId:ids.tenant,issuer,subject:'writer',role:'editor',approvalRef:'schema-test-restore'});
    assert.deepEqual((await send('GET',base+'/schema-receipts/first')).body,first.body);
  });
  await check('SIGTERM only-owned listener/pool cleanup leaves controlled JWKS available',async()=>{await stopServer();assert.equal((await fetch(`http://127.0.0.1:${jwksPort}/keys`)).status,200);});
  await check('database AND server restart preserve exact definitions/receipts/native bytes',async()=>{
    await closeConnections();
    stopPg();
    startPg();
    owner=await connect('wonffice_owner');await startServer(policyFile,'server-restarted');
    assert.deepEqual((await send('GET',base+'/schema-receipts/first')).body,first.body);assert.deepEqual((await send('GET',base+`/schemas/${ids.otherSchema}/versions/1`)).body,{record:dependent.body.record,dependencies:[first.body.record]});
    assert.equal((await owner.query('SELECT snapshot_text FROM wonffice.document_snapshots WHERE document_id=$1',[original.document.documentId])).rows[0].snapshot_text,expectedNativeText);
  });
  await check('operator capability removal gates original actor receipt and dependency reads on restart',async()=>{
    await stopServer();const restricted=join(evidence,'operator-policy-restricted.json');writeFileSync(restricted,JSON.stringify([{...policy[0],capabilities:['note.field.number.v1']}]),{mode:0o600});
    await startServer(restricted,'server-restricted');assert.equal((await send('GET',base+'/schema-receipts/first')).status,403);assert.equal((await send('GET',base+`/schemas/${ids.otherSchema}/versions/1`)).status,403);
    await stopServer();await startServer(policyFile,'server-restored-policy');assert.deepEqual((await send('GET',base+'/schema-receipts/first')).body,first.body);
  });
  if(!originalBaseline){
    const tenant='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',workspace='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const nbase=`/v1/tenants/${tenant}/note-native2`,rbase=`/v1/tenants/${tenant}/workspaces/${workspace}`;
    const pathsA=[['document','attributes','pageId'],['document','content',1,'content',2,'attributes','pageId'],['document','content',4,'content',1,'content',0,'content',1,'attributes','pageId']];
    const pathsB=[['document','attributes','pageId'],['document','content',0,'content',2,'attributes','pageId'],['document','content',1,'content',1,'content',0,'content',1,'attributes','pageId']];
    const raw=file=>JSON.stringify(file,null,2)+'\n';
    const copiedRaw=(file,pageId,paths)=>{
      const copy=structuredClone(file);
      for(const path of paths){let node=copy;for(const key of path.slice(0,-1))node=node[key];node[path.at(-1)]=pageId;}
      return raw({format:copy.format,version:copy.version,schemaBundle:copy.schemaBundle,document:copy.document,...(Object.hasOwn(copy,'savedAt')?{savedAt:copy.savedAt}:{})});
    };
    const pins=(doc,text)=>hash(JSON.stringify(['wonffice.note.snapshot-pins.cas.v1',tenant,workspace,doc,'pinned',JSON.parse(text).schemaBundle.selected.map(r=>[r.schemaId,r.version,r.digest])]));
    const input=(doc,before,after,idempotencyKey,revision=1,schemaAction='adopt')=>Object.freeze({schemaAction,expectedRevision:revision,expectedSnapshotHash:hash(before),expectedPriorPinDigest:pins(doc,before),snapshotText:after,idempotencyKey});
    const audit=async()=>{
      const tables={};
      for(const [table,order] of [['documents','tenant_id,id'],['document_snapshots','tenant_id,document_id'],['document_receipts','tenant_id,identity_id,operation,idempotency_key'],['schema_versions','tenant_id,workspace_id,schema_id,version'],['schema_dependencies','tenant_id,workspace_id,schema_id,version,ordinal'],['schema_registry_receipts','tenant_id,identity_id,idempotency_key'],['workspaces','tenant_id,id']])tables[table]=(await owner.query(`SELECT * FROM wonffice.${table} ORDER BY ${order}`)).rows;
      return JSON.parse(JSON.stringify(tables));
    };
    const saveAudit=(name,value)=>writeFileSync(join(evidence,`native2-${name}.json`),JSON.stringify(value,null,2));
    const assertDenied=async(name,work,status,reason)=>{const before=await audit();saveAudit(name+'-before',before);const response=await work();assert.equal(response.status,status);assert.equal(response.body.status,reason);const after=await audit();saveAudit(name+'-after',after);assert.deepEqual(after,before);};
    await applyMembershipChange(owner,{action:'bootstrap_owner',tenantId:tenant,tenantName:'Native HTTP fixture',issuer,subject:'native-operator',approvalRef:'http-native-owner'});
    for(const [subject,role] of [['writer-a','editor'],['writer-b','editor'],['native-viewer','viewer']])await applyMembershipChange(owner,{action:'grant',tenantId:tenant,issuer,subject,role,approvalRef:'http-'+subject});
    await owner.query('INSERT INTO wonffice.workspaces(tenant_id,id,name) VALUES($1,$2,$3)',[tenant,workspace,'HTTP native workspace']);
    const nativeRegistryPolicy={tenantId:tenant,workspaceId:workspace,readRoles:['editor','viewer'],registerRoles:['editor'],capabilities:policy[0].capabilities};
    policy.push(nativeRegistryPolicy);writeFileSync(policyFile,JSON.stringify(policy),{mode:0o600});
    const documentPolicy={tenantId:tenant,workspaceId:workspace,readRoles:['editor','viewer'],preserveRoles:['editor'],adoptRoles:['editor'],capabilities:policy[0].capabilities};
    const documentPolicyFile=join(evidence,'operator-document-policy.json');writeFileSync(documentPolicyFile,JSON.stringify([documentPolicy]),{mode:0o600});
    await check('native2 optional policy absent/empty default404 and explicit compiled DocumentStore runtime',async()=>{
      assert.equal((await send('GET',nbase+'/documents/'+ids.schema,undefined,'writer-a')).status,404);
      await stopServer();const empty=join(evidence,'operator-document-empty.json');writeFileSync(empty,'[]',{mode:0o600});await startServer(policyFile,'server-native-empty',empty);
      assert.equal((await send('GET',nbase+'/documents/'+ids.schema,undefined,'writer-a')).status,404);
      await stopServer();await startServer(policyFile,'server-native-enabled',documentPolicyFile);
    });
    const registerNative=async(schemaId,version,entry,key)=>{const result=await send('PUT',rbase+`/schemas/${schemaId}/versions/${version}`,{definitionText:entry.definitionText,idempotencyKey:key},'writer-a');assert.equal(result.status,200);assert.equal(result.body.record.definitionText,entry.definitionText);assert.equal(result.body.record.digest,entry.reference.digest);return result;};
    const actorIds=Object.fromEntries((await owner.query('SELECT subject,id FROM wonffice.identities WHERE issuer=$1',[issuer])).rows.map(row=>[row.subject,row.id]));
    const expectedHead=(minted,title,creator,text,revision)=>({documentId:minted.documentId,tenantId:tenant,workspaceId:workspace,product:'note',title,creatorUserId:creator,metadataRevision:1,mode:'snapshot',pageId:minted.pageId,documentKey:`wonffice-${tenant}-${minted.documentId}`,fileFormat:'barocss-note',fileVersion:2,revision,snapshotHash:hash(text)});
    const assertUpdate=(receipt,minted,title,before,after,attempt)=>{
      assert.deepEqual(receipt,{operation:'update',idempotencyKey:attempt.idempotencyKey,requestHash:hash(JSON.stringify(['note-native2-snapshot-v1',tenant,workspace,minted.documentId,attempt.schemaAction,attempt.expectedRevision,hash(before),pins(minted.documentId,before),after])),document:expectedHead(minted,title,actorIds['writer-a'],after,attempt.expectedRevision+1),snapshotText:after});
    };
    const createNative=async(label,file,who='writer-a')=>{
      const result=await send('POST',nbase+'/documents',{workspaceId:workspace,title:label,fileFormat:'barocss-note',fileVersion:2,snapshotText:raw(file),importMode:'new-page-copy',idempotencyKey:'http-create-'+label},who);
      assert.equal(result.status,201);
      const expected=copiedRaw(file,result.body.document.pageId,file===sourceB?pathsB:pathsA);
      assert.deepEqual(result.body,{operation:'create',idempotencyKey:'http-create-'+label,requestHash:hash(JSON.stringify(['note-native2-create-v1',tenant,workspace,'note',label,'barocss-note',2,'new-page-copy',raw(file)])),document:expectedHead(result.body.document,label,actorIds[who],expected,1),snapshotText:expected});
      return result.body;
    };
    const sourceA=HTTP_NATIVE_FIXTURES.SOURCE_A,sourceB=HTTP_NATIVE_FIXTURES.SOURCE_B,targetA=HTTP_NATIVE_FIXTURES.TARGET_A2;
    let A,B,C,rawA,rawB,rawA2,rawC;
    await check('actual HTTP parent-first registry and full independent A1 B1 onlyA2 Bunchanged Ccopy and pinned bundle',async()=>{
      for(const [id,v] of [['22222222-2222-2222-2222-222222222222',1],['22222222-2222-2222-2222-222222222222',2],['11111111-1111-1111-1111-111111111111',1]]){
        const entry=sourceA.schemaBundle.definitions.find(e=>e.reference.schemaId===id&&e.reference.version===v);assert.ok(entry);await registerNative(id,v,entry,'http-register-'+id+'-'+v);
      }
      A=await createNative('A',sourceA);B=await createNative('B',sourceB,'writer-b');
      rawA=copiedRaw(HTTP_NATIVE_FIXTURES.COPY_A_ORACLE,A.document.pageId,pathsA);rawB=copiedRaw(sourceB,B.document.pageId,pathsB);
      assert.equal(A.snapshotText,rawA);assert.equal(B.snapshotText,rawB);assert.notEqual(A.document.documentId,B.document.documentId);assert.notEqual(A.document.creatorUserId,B.document.creatorUserId);
      const before=await audit();const v2=targetA.schemaBundle.definitions.find(e=>e.reference.schemaId==='11111111-1111-1111-1111-111111111111'&&e.reference.version===2);assert.ok(v2);await registerNative(v2.reference.schemaId,2,v2,'http-register-main2');
      const discovered=await audit();assert.deepEqual(discovered.documents,before.documents);assert.deepEqual(discovered.document_snapshots,before.document_snapshots);assert.deepEqual(discovered.document_receipts,before.document_receipts);
      const bBefore={document:discovered.documents.find(d=>d.id===B.document.documentId),snapshot:discovered.document_snapshots.find(d=>d.document_id===B.document.documentId),receipts:discovered.document_receipts.filter(d=>d.document_id===B.document.documentId)};
      rawA2=copiedRaw(targetA,A.document.pageId,pathsA);const adoption=await send('PUT',nbase+`/documents/${A.document.documentId}/snapshot`,input(A.document.documentId,rawA,rawA2,'http-onlyA2'),'writer-a');assert.equal(adoption.status,200);assert.equal(adoption.body.snapshotText,rawA2);assert.equal(adoption.body.document.revision,2);assertUpdate(adoption.body,A.document,'A',rawA,rawA2,input(A.document.documentId,rawA,rawA2,'http-onlyA2'));assert.equal(Object.hasOwn(adoption.body.document,'_noteSchemaReceiptV1'),false);
      const after=await audit();assert.deepEqual({document:after.documents.find(d=>d.id===B.document.documentId),snapshot:after.document_snapshots.find(d=>d.document_id===B.document.documentId),receipts:after.document_receipts.filter(d=>d.document_id===B.document.documentId)},bBefore);
      C=await createNative('C',JSON.parse(rawA2));rawC=copiedRaw(targetA,C.document.pageId,pathsA);assert.equal(C.snapshotText,rawC);
      for(const [receipt,text,v,revision] of [[A,rawA2,2,2],[B,rawB,1,1],[C,rawC,2,1]]){
        const id=receipt.document.documentId,opened=await send('GET',nbase+`/documents/${id}`,undefined,'writer-a');assert.equal(opened.status,200);assert.equal(opened.body.snapshotText,text);assert.equal(opened.body.document.snapshotHash,hash(text));assert.equal(opened.body.document.revision,revision);assert.equal(opened.body.document.fileVersion,2);
        const bundle=await send('GET',nbase+`/documents/${id}/schema-bundle`,undefined,'writer-a');assert.deepEqual(bundle.body,{status:'pinned',documentId:id,documentRevision:revision,snapshotHash:hash(text),nativeFormat:{format:'barocss-note',version:2},bundle:JSON.parse(text).schemaBundle});assert.equal(bundle.body.bundle.selected[0].version,v);
        const sql=(await owner.query('SELECT snapshot_text,snapshot_hash,revision,file_version FROM wonffice.document_snapshots WHERE document_id=$1',[id])).rows[0];assert.deepEqual(sql,{snapshot_text:text,snapshot_hash:hash(text),revision,file_version:2});
      }
      saveAudit('ABC-original',await audit());
    });

    if(mcpEnabled){
      const mcpReadNoEffects=async(client,receipt,title,creator,text,revision)=>{
        const before=await audit(),result=await mcpTool(client,tenant,receipt.document.documentId);
        assert.equal(result.isError,false);assert.deepEqual(result.body,{status:'pinned',document:expectedHead(receipt.document,title,creator,text,revision),snapshotText:text,
          documentRevision:revision,snapshotHash:hash(text),nativeFormat:{format:'barocss-note',version:2},bundle:JSON.parse(text).schemaBundle});
        assert.deepEqual(await audit(),before);
      };
      const mcpDenied=async(label,bearer,receipt,reason)=>{
        const before=await audit();saveAudit('mcp-'+label+'-before',before);
        await withMcp(bearer,async client=>{const result=await mcpTool(client,tenant,receipt.document.documentId);assert.equal(result.isError,true);assert.deepEqual(result.body,{status:reason});});
        const after=await audit();assert.deepEqual(after,before);saveAudit('mcp-'+label+'-after',after);
      };
      await check('MCP actual staged SDK initialize expanded tools exact A2 B1 C2 and complete SQL no-effects',async()=>{
        await withMcp(await token('writer-a'),async client=>{
          for(const [receipt,title,creator,text,revision] of [[A,'A',actorIds['writer-a'],rawA2,2],[B,'B',actorIds['writer-b'],rawB,1],[C,'C',actorIds['writer-a'],rawC,1]])await mcpReadNoEffects(client,receipt,title,creator,text,revision);
          const before=await audit();await assert.rejects(client.callTool({name:'adopt_schema',arguments:{tenantId:tenant,documentId:A.document.documentId}}));
          for(const argumentsValue of [{tenantId:tenant,documentId:A.document.documentId,role:'owner',approved:true},{tenantId:tenant,documentId:'not-a-uuid'}]){
            const result=await client.callTool({name:'get_schema_bundle',arguments:argumentsValue});assert.equal(result.isError,true);
          }
          assert.deepEqual(await audit(),before);
        });
      });
      await check('MCP actual signed JWT absent forged expired foreign denial with no returned body or effect',async()=>{
        await mcpDenied('anonymous',undefined,A,'unauthorized');await mcpDenied('forged','invalid.jwt.value',A,'unauthorized');
        await mcpDenied('expired',await token('writer-a',{expiration:1}),A,'unauthorized');await mcpDenied('foreign',await token('foreign'),A,'scope_forbidden');
      });
      await check('MCP same-child current membership role removal and restored fresh request without SQL effects',async()=>{
        const captured=await token('writer-a'),restricted=join(evidence,'mcp-policy-editor-only.json');writeFileSync(restricted,JSON.stringify([{...documentPolicy,readRoles:['editor']}]),{mode:0o600});
        await stopServer();await startServer(policyFile,'server-mcp-editor-only',restricted);
        await mcpDenied('viewer-without-policy',await token('native-viewer'),A,'scope_forbidden');
        await withMcp(captured,async client=>{
          await mcpReadNoEffects(client,A,'A',actorIds['writer-a'],rawA2,2);
          await applyMembershipChange(owner,{action:'grant',tenantId:tenant,issuer,subject:'writer-a',role:'viewer',approvalRef:'mcp-current-viewer'});
          const before=await audit();const denied=await mcpTool(client,tenant,A.document.documentId);assert.equal(denied.isError,true);assert.deepEqual(denied.body,{status:'scope_forbidden'});assert.deepEqual(await audit(),before);
          await applyMembershipChange(owner,{action:'grant',tenantId:tenant,issuer,subject:'writer-a',role:'editor',approvalRef:'mcp-restored-editor'});
          await mcpReadNoEffects(client,A,'A',actorIds['writer-a'],rawA2,2);
        });
        await applyMembershipChange(owner,{action:'grant',tenantId:tenant,issuer,subject:'mcp-revoked',role:'editor',approvalRef:'mcp-grant-revoke-user'});const revocable=await token('mcp-revoked');
        await withMcp(revocable,async client=>{
          await mcpReadNoEffects(client,A,'A',actorIds['writer-a'],rawA2,2);
          await applyMembershipChange(owner,{action:'revoke',tenantId:tenant,issuer,subject:'mcp-revoked',role:'editor',approvalRef:'mcp-remove-user'});
          const before=await audit(),denied=await mcpTool(client,tenant,A.document.documentId);assert.equal(denied.isError,true);assert.deepEqual(denied.body,{status:'scope_forbidden'});assert.deepEqual(await audit(),before);
        });
        await stopServer();await startServer(policyFile,'server-mcp-membership-restored',documentPolicyFile);
      });
      await check('MCP existing A2 absent and empty operator document policy denies without effects',async()=>{
        await stopServer();await startServer(policyFile,'server-mcp-policy-absent');await mcpDenied('absent-policy',await token('writer-a'),A,'not_found');
        const empty=join(evidence,'mcp-empty-policy.json');writeFileSync(empty,'[]',{mode:0o600});await stopServer();await startServer(policyFile,'server-mcp-policy-empty',empty);await mcpDenied('empty-policy',await token('writer-a'),A,'not_found');
        await stopServer();await startServer(policyFile,'server-mcp-policy-restored',documentPolicyFile);
      });
      await check('MCP real same-tenant other-workspace document policy denial without read effects',async()=>{
        const otherWorkspace='dddddddd-dddd-4ddd-8ddd-dddddddddddd';await owner.query('INSERT INTO wonffice.workspaces(tenant_id,id,name) VALUES($1,$2,$3)',[tenant,otherWorkspace,'MCP other workspace']);
        const declared=structuredClone(sourceA),references=new Map();
        for(const [schemaId,version] of [['22222222-2222-2222-2222-222222222222',1],['22222222-2222-2222-2222-222222222222',2],['11111111-1111-1111-1111-111111111111',1]]){
          const entry=declared.schemaBundle.definitions.find(e=>e.reference.schemaId===schemaId&&e.reference.version===version),definition=JSON.parse(entry.definitionText);definition.scope.workspaceId=otherWorkspace;
          if(definition.parent)definition.parent=references.get(`${definition.parent.schemaId}:${definition.parent.version}`);
          definition.dependencies=definition.dependencies.map(ref=>references.get(`${ref.schemaId}:${ref.version}`));entry.definitionText=JSON.stringify(definition,null,2);entry.reference={schemaId,version,digest:hash(parseRegistryDefinition(entry.definitionText).canonicalText)};references.set(`${schemaId}:${version}`,entry.reference);
        }
        declared.schemaBundle.selected=declared.schemaBundle.selected.map(ref=>references.get(`${ref.schemaId}:${ref.version}`));
        const registryPolicy={...nativeRegistryPolicy,workspaceId:otherWorkspace};policy.push(registryPolicy);writeFileSync(policyFile,JSON.stringify(policy),{mode:0o600});
        const both=join(evidence,'mcp-two-workspace-policy.json');writeFileSync(both,JSON.stringify([documentPolicy,{...documentPolicy,workspaceId:otherWorkspace}]),{mode:0o600});await stopServer();await startServer(policyFile,'server-mcp-two-workspace-setup',both);
        for(const [schemaId,version] of [['22222222-2222-2222-2222-222222222222',1],['22222222-2222-2222-2222-222222222222',2],['11111111-1111-1111-1111-111111111111',1]]){
          const entry=declared.schemaBundle.definitions.find(e=>e.reference.schemaId===schemaId&&e.reference.version===version);assert.equal((await send('PUT',`/v1/tenants/${tenant}/workspaces/${otherWorkspace}/schemas/${schemaId}/versions/${version}`,{definitionText:entry.definitionText,idempotencyKey:'mcp-other-'+schemaId+'-'+version},'writer-a')).status,200);
        }
        const created=await send('POST',nbase+'/documents',{workspaceId:otherWorkspace,title:'MCP other',fileFormat:'barocss-note',fileVersion:2,snapshotText:raw(declared),importMode:'new-page-copy',idempotencyKey:'mcp-other-document'},'writer-a');assert.equal(created.status,201);assert.equal(created.body.document.workspaceId,otherWorkspace);
        await stopServer();await startServer(policyFile,'server-mcp-other-workspace-denied',documentPolicyFile);await mcpDenied('other-workspace',await token('writer-a'),created.body,'scope_forbidden');
      });
      // #500 independently authored registry fixtures. No product canonicalizer supplies the oracle.
      const mcpSchema='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
      const declared=(version=1,parent=null,dependencies=[])=>({scope:{tenantId:tenant,workspaceId:workspace},
        schemaId:mcpSchema,version,dialect:'wonffice.note-fields.v1',parent,dependencies,
        requiredCapabilities:['note.field.text.v1'],dataset:{name:'MCP registry proof',fields:[{name:'Title',kind:'text'}]}});
      const canonicalRegistration=(version=1,parent=null,dependencies=[])=>`{"dataset":{"fields":[{"kind":"text","name":"Title"}],"name":"MCP registry proof"},"dependencies":${JSON.stringify(dependencies)},"dialect":"wonffice.note-fields.v1","parent":${JSON.stringify(parent)},"requiredCapabilities":["note.field.text.v1"],"schemaId":"${mcpSchema}","scope":{"tenantId":"${tenant}","workspaceId":"${workspace}"},"version":${version}}`;
      const submitted=JSON.stringify(declared(),null,2)+'\n';
      const registrationInput=(definitionText=submitted,idempotencyKey='mcp-register-first',version=1)=>({tenantId:tenant,workspaceId:workspace,schemaId:mcpSchema,version,definitionText,idempotencyKey});
      const mcpRegister=async(client,input)=>{
        const result=await client.callTool({name:'register_schema',arguments:input});
        assert.ok(Array.isArray(result.content)&&result.content.length===1&&result.content[0].type==='text');
        return {isError:result.isError===true,body:JSON.parse(result.content[0].text)};
      };
      const registrationDenied=async(client,label,input,reason)=>{
        const before=await audit();saveAudit('mcp-register-'+label+'-before',before);
        const result=await mcpRegister(client,input);assert.equal(result.isError,true);
        if(reason)assert.deepEqual(result.body,{status:reason});
        const after=await audit();assert.deepEqual(after,before);saveAudit('mcp-register-'+label+'-after',after);
      };
      const currentEpoch=async()=>{
        const result=await owner.query(`SELECT m.role || ':' || (SELECT count(*)::text FROM wonffice.membership_events e
          WHERE e.tenant_id=m.tenant_id AND e.identity_id=m.identity_id) epoch FROM wonffice.tenant_memberships m
          WHERE m.tenant_id=$1 AND m.identity_id=$2 AND m.revoked_at IS NULL`,[tenant,actorIds['writer-a']]);
        assert.equal(result.rows.length,1);return result.rows[0].epoch;
      };
      const expectedRegistration=async(input,storedText,canonicalText,dependencies=[])=>{
        const rows=(await owner.query(`SELECT * FROM wonffice.schema_versions WHERE tenant_id=$1 AND workspace_id=$2 AND schema_id=$3 AND version=$4`,[tenant,workspace,mcpSchema,input.version])).rows;
        assert.equal(rows.length,1);const row=rows[0];assert.ok(Number.isFinite(row.created_at.getTime()));
        const record={schemaId:mcpSchema,version:input.version,digest:hash(canonicalText),digestAlgorithm:'wonffice.canonical-json.sha256.v1',
          definitionText:storedText,canonicalText,definition:JSON.parse(storedText),actorIdentityId:actorIds['writer-a'],createdAt:row.created_at.toISOString()};
        assert.deepEqual(row,{tenant_id:tenant,workspace_id:workspace,schema_id:mcpSchema,version:input.version,digest:record.digest,
          definition_text:storedText,canonical_text:canonicalText,actor_identity_id:actorIds['writer-a'],created_at:row.created_at});
        return {operation:'register',idempotencyKey:input.idempotencyKey,
          requestHash:hash(JSON.stringify(['schema-register-v1',tenant,workspace,mcpSchema,input.version,input.definitionText])),
          requesterIdentityId:actorIds['writer-a'],authorityEpoch:await currentEpoch(),record,dependencies};
      };
      const assertPersistedReceipt=async expected=>{
        const rows=(await owner.query('SELECT * FROM wonffice.schema_registry_receipts WHERE tenant_id=$1 AND identity_id=$2 AND idempotency_key=$3',[tenant,actorIds['writer-a'],expected.idempotencyKey])).rows;
        assert.equal(rows.length,1);const row=rows[0];assert.ok(Number.isFinite(row.created_at.getTime()));
        assert.deepEqual(row,{tenant_id:tenant,workspace_id:workspace,identity_id:actorIds['writer-a'],idempotency_key:expected.idempotencyKey,
          request_hash:expected.requestHash,result:expected,created_at:row.created_at});
      };
      let mcpFirst,mcpSecond,mcpThird;
      await check('MCP register actual current signed actor and exact raw canonical digest SQL receipt; fixed retry no extra effects',async()=>{
        await withMcp(await token('writer-a'),async client=>{
          const before=await audit(),input=registrationInput(),result=await mcpRegister(client,input);
          assert.equal(result.isError,false);mcpFirst=await expectedRegistration(input,submitted,canonicalRegistration());assert.deepEqual(result.body,mcpFirst);await assertPersistedReceipt(mcpFirst);
          const after=await audit();assert.equal(after.schema_versions.length,before.schema_versions.length+1);assert.equal(after.schema_registry_receipts.length,before.schema_registry_receipts.length+1);
          assert.deepEqual(after.schema_versions.filter(row=>row.schema_id!==mcpSchema),before.schema_versions);
          assert.deepEqual(after.schema_registry_receipts.filter(row=>row.idempotency_key!==input.idempotencyKey),before.schema_registry_receipts);
          for(const table of ['documents','document_snapshots','document_receipts','schema_dependencies','workspaces'])assert.deepEqual(after[table],before[table]);
          const retry=await mcpRegister(client,input);assert.equal(retry.isError,false);assert.deepEqual(retry.body,mcpFirst);assert.deepEqual(await audit(),after);
          saveAudit('mcp-register-first',after);writeFileSync(join(evidence,'mcp-register-first-receipt.json'),JSON.stringify(mcpFirst,null,2));
        });
      });
      await check('MCP register equivalent new raw bytes keep first stored definition and bind the new exact request hash',async()=>{
        await withMcp(await token('writer-a'),async client=>{
          const input=registrationInput(JSON.stringify(declared()),'mcp-register-equivalent'),before=await audit(),result=await mcpRegister(client,input);
          assert.equal(result.isError,false);const expected=await expectedRegistration(input,submitted,canonicalRegistration());assert.deepEqual(result.body,expected);await assertPersistedReceipt(expected);
          assert.notEqual(expected.requestHash,mcpFirst.requestHash);assert.equal(expected.record.definitionText,submitted);
          const after=await audit();for(const table of Object.keys(before).filter(t=>t!=='schema_registry_receipts'))assert.deepEqual(after[table],before[table]);
          assert.equal(after.schema_registry_receipts.length,before.schema_registry_receipts.length+1);
          assert.deepEqual(after.schema_registry_receipts.filter(row=>row.idempotency_key!==input.idempotencyKey),before.schema_registry_receipts);
        });
      });
      await check('MCP register complete immutable parent closure and independent SQL edge; no native adoption',async()=>{
        const ref={schemaId:mcpSchema,version:1,digest:hash(canonicalRegistration())};
        // Canonical reference field order is explicitly authored, independent of the input object order.
        const parentCanonical={digest:ref.digest,schemaId:mcpSchema,version:1};
        const input=registrationInput(JSON.stringify(declared(2,ref),null,2),'mcp-register-parent',2);
        await withMcp(await token('writer-a'),async client=>{
          const before=await audit(),result=await mcpRegister(client,input);assert.equal(result.isError,false);
          mcpSecond=await expectedRegistration(input,input.definitionText,canonicalRegistration(2,parentCanonical),[mcpFirst.record]);
          assert.deepEqual(result.body,mcpSecond);await assertPersistedReceipt(mcpSecond);
          const after=await audit();for(const table of ['documents','document_snapshots','document_receipts','workspaces'])assert.deepEqual(after[table],before[table]);
          assert.equal(after.schema_versions.length,before.schema_versions.length+1);assert.equal(after.schema_registry_receipts.length,before.schema_registry_receipts.length+1);
          assert.deepEqual(after.schema_dependencies.filter(row=>row.schema_id===mcpSchema),[{tenant_id:tenant,workspace_id:workspace,schema_id:mcpSchema,version:2,ordinal:0,kind:'parent',dependency_id:mcpSchema,dependency_version:1,dependency_digest:ref.digest}]);
        });
      });
      await check('MCP register parent plus dependency complete closure exact SQL ordinal edges',async()=>{
        const parent={schemaId:mcpSchema,version:2,digest:mcpSecond.record.digest},dependency={schemaId:mcpSchema,version:1,digest:mcpFirst.record.digest};
        const parentCanonical={digest:parent.digest,schemaId:mcpSchema,version:2},dependencyCanonical={digest:dependency.digest,schemaId:mcpSchema,version:1};
        const input=registrationInput(JSON.stringify(declared(3,parent,[dependency]),null,2),'mcp-register-full-closure',3);
        await withMcp(await token('writer-a'),async client=>{
          const before=await audit(),result=await mcpRegister(client,input);assert.equal(result.isError,false);
          mcpThird=await expectedRegistration(input,input.definitionText,canonicalRegistration(3,parentCanonical,[dependencyCanonical]),[mcpSecond.record,mcpFirst.record]);
          assert.deepEqual(result.body,mcpThird);await assertPersistedReceipt(mcpThird);
          const after=await audit();for(const table of ['documents','document_snapshots','document_receipts','workspaces'])assert.deepEqual(after[table],before[table]);
          assert.equal(after.schema_versions.length,before.schema_versions.length+1);assert.equal(after.schema_registry_receipts.length,before.schema_registry_receipts.length+1);
          assert.deepEqual(after.schema_dependencies.filter(row=>row.schema_id===mcpSchema&&row.version===3),[
            {tenant_id:tenant,workspace_id:workspace,schema_id:mcpSchema,version:3,ordinal:0,kind:'parent',dependency_id:mcpSchema,dependency_version:2,dependency_digest:parent.digest},
            {tenant_id:tenant,workspace_id:workspace,schema_id:mcpSchema,version:3,ordinal:1,kind:'dependency',dependency_id:mcpSchema,dependency_version:1,dependency_digest:dependency.digest}]);
        });
      });
      await check('MCP register raw key reuse immutable conflict missing cycle executable oversized and forged arguments all no effects',async()=>{
        await withMcp(await token('writer-a'),async client=>{
          await registrationDenied(client,'key-reuse',registrationInput(' '+submitted),'key_reuse');
          const conflict=declared();conflict.dataset.name='Changed meaning';await registrationDenied(client,'immutable',registrationInput(JSON.stringify(conflict),'mcp-register-conflict'),'immutable_version_conflict');
          const missing={schemaId:'ffffffff-ffff-4fff-8fff-ffffffffffff',version:1,digest:'0'.repeat(64)};
          await registrationDenied(client,'missing',registrationInput(JSON.stringify(declared(1,null,[missing])),'mcp-register-missing'),'dependency_missing');
          const cycle={schemaId:mcpSchema,version:1,digest:'0'.repeat(64)};
          await registrationDenied(client,'cycle',registrationInput(JSON.stringify(declared(1,null,[cycle])),'mcp-register-cycle'),'dependency_cycle');
          await registrationDenied(client,'executable',registrationInput(JSON.stringify({...declared(),validator:'execute()'}),'mcp-register-executable'),'unsupported_definition');
          await registrationDenied(client,'oversized',registrationInput(' '.repeat(65537),'mcp-register-oversized'),'definition_too_large');
          for(const [label,change] of [['role',{role:'owner'}],['token',{token:'caller-token'}],['url',{url:'http://invalid.test'}],['grant',{approved:true}],['version',{version:0}]]){const before=await audit();saveAudit('mcp-register-invalid-'+label+'-before',before);const response=await client.callTool({name:'register_schema',arguments:{...registrationInput(),...change}});assert.equal(response.isError,true);assert.ok(response.content.every(item=>item.type==='text'));const after=await audit();assert.deepEqual(after,before);saveAudit('mcp-register-invalid-'+label+'-after',after);}
        });
      });
      await check('MCP register current viewer foreign missing forged expired and same-child revoked actor cannot publish or replay',async()=>{
        for(const [label,bearer,reason] of [['viewer',await token('native-viewer'),'scope_forbidden'],['foreign',await token('foreign'),'scope_forbidden'],['anonymous',undefined,'unauthorized'],['forged','invalid.jwt.value','unauthorized'],['expired',await token('writer-a',{expiration:1}),'unauthorized']]){
          await withMcp(bearer,client=>registrationDenied(client,label,registrationInput(),'scope_forbidden'===reason?reason:'unauthorized'));
        }
        const bearer=await token('writer-a');await withMcp(bearer,async client=>{
          assert.deepEqual((await mcpRegister(client,registrationInput())).body,mcpFirst);
          await applyMembershipChange(owner,{action:'revoke',tenantId:tenant,issuer,subject:'writer-a',role:'editor',approvalRef:'mcp-register-revoke'});
          await registrationDenied(client,'current-revoked-replay',registrationInput(),'scope_forbidden');
          await registrationDenied(client,'current-revoked-new',registrationInput(JSON.stringify(declared(4,{schemaId:mcpSchema,version:3,digest:mcpThird.record.digest})),'mcp-register-revoked-new',4),'scope_forbidden');
        });
        await applyMembershipChange(owner,{action:'grant',tenantId:tenant,issuer,subject:'writer-a',role:'editor',approvalRef:'mcp-register-restore'});
      });
      await check('MCP register current operator capability withdrawal denies saved retry and new publication without effects',async()=>{
        const restricted=join(evidence,'mcp-register-policy-restricted.json');writeFileSync(restricted,JSON.stringify(policy.map(p=>p.tenantId===tenant&&p.workspaceId===workspace?{...p,capabilities:['note.field.number.v1']}:p)),{mode:0o600});
        await stopServer();await startServer(restricted,'server-mcp-register-capability-denied',documentPolicyFile);
        await withMcp(await token('writer-a'),async client=>{
          await registrationDenied(client,'capability-replay',registrationInput(),'scope_forbidden');
          await registrationDenied(client,'capability-new',registrationInput(JSON.stringify(declared(4,{schemaId:mcpSchema,version:3,digest:mcpThird.record.digest})),'mcp-register-capability-new',4),'scope_forbidden');
        });
        await stopServer();await startServer(policyFile,'server-mcp-register-capability-restored',documentPolicyFile);
        await withMcp(await token('writer-a'),async client=>{const before=await audit();assert.deepEqual((await mcpRegister(client,registrationInput())).body,mcpFirst);assert.deepEqual(await audit(),before);});
      });
      report.mcpRegistration={status:'passed',qualification:'Actual staged SDK MCP PUT through existing current signedJWT/operator policy/private PostgreSQL, not genuine provider/LLM/UI or adoption',tools:['get_schema_bundle','register_schema'],originalReceipt:mcpFirst,parentReceipt:mcpSecond,completeClosureReceipt:mcpThird,noSecondStore:true};
      report.mcp={status:'passed',qualification:'Actual independent SDK/staged compiled MCP/current signedJWKS/privatePG service, not genuine user login/LLM/UI or adoption',children:mcpResources,tools:['get_schema_bundle','register_schema'],noSecondStore:true};save();
    }

    const fresh=async label=>{const receipt=await createNative(label,sourceA);return {receipt,before:copiedRaw(HTTP_NATIVE_FIXTURES.COPY_A_ORACLE,receipt.document.pageId,pathsA),after:copiedRaw(targetA,receipt.document.pageId,pathsA)};};
    await check('strict native2 HTTP DTO missing grant/query/legacy/hash/pin boundaries and current viewer foreign denial',async()=>{
      const x=await fresh('negative'),id=x.receipt.document.documentId,valid=input(id,x.before,x.after,'http-negative');
      for(const [name,change] of [['body-grant',{approved:true}],['hash-missing',{expectedSnapshotHash:undefined}],['action-object',{schemaAction:{}}]])await assertDenied(name,()=>send('PUT',nbase+`/documents/${id}/snapshot`,{...valid,...change},'writer-a'),400,'invalid_request');
      await assertDenied('legacy-write',()=>send('PUT',nbase+`/documents/${id}/snapshot`,{...valid,snapshotText:sourceText},'writer-a'),422,'invalid_snapshot');
      for(const [name,change,reason] of [['rawhash',{expectedSnapshotHash:'0'.repeat(64)},'snapshot_hash_conflict'],['priorpins',{expectedPriorPinDigest:'0'.repeat(64)},'schema_pin_conflict'],['revision',{expectedRevision:2},'revision_conflict']])await assertDenied(name,()=>send('PUT',nbase+`/documents/${id}/snapshot`,{...valid,...change,idempotencyKey:'http-negative-'+name},'writer-a'),409,reason);
      const createBody=file=>({workspaceId:workspace,title:'Refused native',fileFormat:'barocss-note',fileVersion:2,snapshotText:raw(file),importMode:'new-page-copy',idempotencyKey:'http-native-missing'});
      await assertDenied('native-unregistered',()=>send('POST',nbase+'/documents',createBody(UNREGISTERED_NATIVE_FIXTURE),'writer-a'),422,'dependency_missing');
      const unsupported=structuredClone(sourceA);unsupported.document.content[0].content[0].marks=[{stype:'untrusted-executable-mark'}];
      await assertDenied('native-unsupported-mark',()=>send('POST',nbase+'/documents',createBody(unsupported),'writer-a'),422,'invalid_snapshot');
      const beforeAuth=await audit();assert.equal((await fetch(origin+nbase+`/documents/${id}`)).status,401);
      assert.equal((await fetch(origin+nbase+`/documents/${id}`,{headers:{authorization:`Bearer ${await token('writer-a',{typ:'ID'})}`}})).status,401);assert.deepEqual(await audit(),beforeAuth);
      await assertDenied('viewer-write',()=>send('PUT',nbase+`/documents/${id}/snapshot`,valid,'native-viewer'),403,'forbidden');
      await assertDenied('foreign-read',()=>send('GET',nbase+`/documents/${id}`,undefined,'foreign'),403,'forbidden');
      assert.equal((await send('GET',nbase+`/documents/${id}`,undefined,'native-viewer')).body.snapshotText,x.before);
      await assertDenied('query-grant',()=>send('GET',nbase+`/documents/${id}?approved=true`,undefined,'writer-a'),400,'invalid_request');
    });
    observer=await connect('schema_test_admin');
    const barrier=async(where,params,ownerPid,label,count)=>{
      const deadline=Date.now()+2200;let rows=[];
      while(Date.now()<deadline){
        rows=(await observer.query(`SELECT pid,application_name,wait_event_type,wait_event,query,pg_blocking_pids(pid) blockers FROM pg_stat_activity WHERE usename='wonffice_app' AND ${where}`,params)).rows;
        const chain=async(pid,seen=new Set())=>{if(pid===ownerPid)return [pid];if(seen.has(pid)||seen.size>=8)return null;seen.add(pid);const next=(await observer.query('SELECT pg_blocking_pids($1) blockers',[pid])).rows[0].blockers;for(const p of next){const found=await chain(p,new Set(seen));if(found)return [pid,...found];}return null;};
        const waiting=[];for(const row of rows)if(row.wait_event_type==='Lock'){const path=await chain(row.pid);if(path)waiting.push({...row,ownerChain:path});}
        if(waiting.length===count&&new Set(waiting.map(r=>r.pid)).size===count){writeFileSync(join(evidence,label+'-barrier.json'),JSON.stringify({ownerPid,waiting},null,2));return;}
        await new Promise(resolve=>setTimeout(resolve,10));
      }
      throw new Error('actual_HTTP_PG_barrier_NOT_REACHED:'+label+':'+JSON.stringify(rows));
    };
    await check('two actual HTTP writers real distinct blocked PG backends oneCAS winner one409 oneeffect and fixedsamekey retry',async()=>{
      const x=await fresh('race'),id=x.receipt.document.documentId;await owner.query('BEGIN');const ownerPid=(await owner.query('SELECT pg_backend_pid() pid')).rows[0].pid;
      await owner.query('SELECT d.id FROM wonffice.documents d JOIN wonffice.document_snapshots s ON s.tenant_id=d.tenant_id AND s.document_id=d.id WHERE d.id=$1 FOR UPDATE OF d,s',[id]);
      const pending=Promise.all([send('PUT',nbase+`/documents/${id}/snapshot`,input(id,x.before,x.after,'http-race-a'),'writer-a'),send('PUT',nbase+`/documents/${id}/snapshot`,input(id,x.before,x.after,'http-race-b'),'writer-b')]);
      try{await barrier("query LIKE '%FOR UPDATE OF d,s%'",[],ownerPid,'http-cas',2);}finally{await owner.query('COMMIT');}
      const responses=await pending;assert.equal(responses.filter(x=>x.status===200).length,1);assert.equal(responses.filter(x=>x.status===409&&x.body.status==='revision_conflict').length,1);
      const state=await audit();assert.equal(state.document_receipts.filter(r=>r.document_id===id&&r.operation==='update').length,1);assert.equal(state.document_snapshots.find(r=>r.document_id===id).snapshot_text,x.after);
      const winner=responses.find(x=>x.status===200).body,key=winner.idempotencyKey,who=key==='http-race-a'?'writer-a':'writer-b';assertUpdate(winner,x.receipt.document,'race',x.before,x.after,input(id,x.before,x.after,key));
      assert.deepEqual((await send('PUT',nbase+`/documents/${id}/snapshot`,input(id,x.before,x.after,key),who)).body,winner);assert.deepEqual(await audit(),state);
      await assertDenied('samekey-changed',()=>send('PUT',nbase+`/documents/${id}/snapshot`,input(id,x.before,x.after+' ',key),who),409,'key_reuse');
    });
    await check('real HTTP held current membership role and revoke refuse before effect',async()=>{
      const actor=(await owner.query('SELECT id FROM wonffice.identities WHERE issuer=$1 AND subject=$2',[issuer,'writer-a'])).rows[0].id;
      for(const mutation of ['viewer','revoked']){
        const x=await fresh('held-'+mutation),id=x.receipt.document.documentId,before=await audit();await owner.query('BEGIN');const ownerPid=(await owner.query('SELECT pg_backend_pid() pid')).rows[0].pid;
        await owner.query('SELECT identity_id FROM wonffice.tenant_memberships WHERE tenant_id=$1 AND identity_id=$2 FOR UPDATE',[tenant,actor]);
        const pending=send('PUT',nbase+`/documents/${id}/snapshot`,input(id,x.before,x.after,'http-held-'+mutation),'writer-a');
        try{await barrier("query LIKE '%project_current_actor%'",[],ownerPid,'http-current-'+mutation,1);await owner.query(mutation==='viewer'?"UPDATE wonffice.tenant_memberships SET role='viewer' WHERE tenant_id=$1 AND identity_id=$2":'UPDATE wonffice.tenant_memberships SET revoked_at=now() WHERE tenant_id=$1 AND identity_id=$2',[tenant,actor]);}finally{await owner.query('COMMIT');}
        const response=await pending;assert.equal(response.status,403);assert.equal(response.body.status,'forbidden');assert.deepEqual(await audit(),before);
        await applyMembershipChange(owner,{action:'grant',tenantId:tenant,issuer,subject:'writer-a',role:'editor',approvalRef:'http-restored-'+mutation});
        assert.equal((await send('PUT',nbase+`/documents/${id}/snapshot`,input(id,x.before,x.after,'http-restored-'+mutation),'writer-a')).status,200);
      }
    });
    await check('HTTP actual stagedtarget receipt NOTICE P0001 rollback preserves full native and no provisional receipt',async()=>{
      const x=await fresh('rollback'),id=x.receipt.document.documentId,before=await audit(),targetHash=hash(x.after);
      await owner.query(`CREATE FUNCTION wonffice.http_native2_receipt_failure() RETURNS trigger LANGUAGE plpgsql AS $fn$ DECLARE actual record; BEGIN
        IF NEW.idempotency_key='http-fail-after-snapshot' AND NEW.document_id='${id}'::uuid THEN
          SELECT snapshot_hash,revision,file_version,snapshot_text INTO actual FROM wonffice.document_snapshots WHERE document_id=NEW.document_id;
          IF actual.snapshot_hash<>'${targetHash}' OR actual.revision<>2 OR actual.file_version<>2 OR actual.snapshot_text::jsonb#>>'{schemaBundle,selected,0,version}'<>'2' THEN RAISE EXCEPTION 'http_failpoint_target_NOT_REACHED'; END IF;
          RAISE NOTICE 'http_native2_receipt_failure_target_seen';RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='http_native2_receipt_failure';
        END IF;RETURN NEW;END $fn$;CREATE TRIGGER http_native2_receipt_failure BEFORE UPDATE ON wonffice.document_receipts FOR EACH ROW EXECUTE FUNCTION wonffice.http_native2_receipt_failure()`);
      const response=await send('PUT',nbase+`/documents/${id}/snapshot`,input(id,x.before,x.after,'http-fail-after-snapshot'),'writer-a');assert.equal(response.status,503);assert.equal(response.body.status,'schema_store_unavailable');assert.deepEqual(await audit(),before);
      assert.ok(readFileSync(join(privateRoot,'postgres.log'),'utf8').includes('http_native2_receipt_failure_target_seen'));
      await owner.query('DROP TRIGGER http_native2_receipt_failure ON wonffice.document_receipts;DROP FUNCTION wonffice.http_native2_receipt_failure()');saveAudit('rollback-restored',await audit());
    });
    let history,historyInput,historyId,historyAfter;
    await check('physical owned HTTP response drop aftercommit immutable retry receipt laterdraft and persistence',async()=>{
      const x=await fresh('lost-http');historyId=x.receipt.document.documentId;historyAfter=x.after;historyInput=input(historyId,x.before,x.after,'http-physical-omit');
      const frozen=JSON.stringify(historyInput),laterDraft=Object.freeze({key:'http-unsent-later',raw:x.after+' '}),laterBytes=JSON.stringify(laterDraft);
      let delivered;const dropped=new Promise(resolve=>{delivered=resolve;});
      forwarder=createServer((request,response)=>{
        const upstream=httpRequest(new URL(request.url,origin),{method:request.method,headers:request.headers},result=>{
          const chunks=[];result.on('data',b=>chunks.push(b));result.on('end',()=>{lease.omittedResponse={upstreamStatus:result.statusCode,bytes:Buffer.concat(chunks).length,qualification:'Actual upstreamHTTPresponse buffered after committed operation; downstream socket intentionallyclosed, no delivery'};saveLease();response.destroy();delivered();});
        });upstream.on('error',error=>{response.destroy(error);delivered();});request.pipe(upstream);
      });await new Promise((resolve,reject)=>{forwarder.once('error',reject);forwarder.listen(0,'127.0.0.1',resolve);});lease.forwarderPort=forwarder.address().port;saveLease();
      try{await assert.rejects(fetch(`http://127.0.0.1:${lease.forwarderPort}${nbase}/documents/${historyId}/snapshot`,{method:'PUT',headers:{authorization:`Bearer ${await token('writer-a')}`,'content-type':'application/json'},body:frozen}));await dropped;assert.equal(lease.omittedResponse.upstreamStatus,200);}
      finally{forwarder.closeAllConnections();await new Promise(resolve=>forwarder.close(resolve));forwarder=undefined;}
      const committed=await audit();assert.equal(committed.document_receipts.filter(r=>r.document_id===historyId&&r.operation==='update').length,1);assert.equal(committed.document_snapshots.find(r=>r.document_id===historyId).snapshot_text,x.after);
      history=(await send('GET',nbase+'/receipts/update/'+historyInput.idempotencyKey,undefined,'writer-a')).body;assert.equal(history.document.revision,2);assert.equal(history.snapshotText,x.after);assertUpdate(history,x.receipt.document,'lost-http',x.before,x.after,historyInput);
      assert.deepEqual((await send('PUT',nbase+`/documents/${historyId}/snapshot`,historyInput,'writer-a')).body,history);assert.deepEqual(await audit(),committed);assert.equal(JSON.stringify(historyInput),frozen);assert.equal(JSON.stringify(laterDraft),laterBytes);
      const later=input(historyId,x.after,x.after+' ','http-explicit-later',2,'preserve');assert.equal((await send('PUT',nbase+`/documents/${historyId}/snapshot`,later,'writer-a')).status,200);const laterState=await audit();
      assert.deepEqual((await send('PUT',nbase+`/documents/${historyId}/snapshot`,historyInput,'writer-a')).body,history);assert.deepEqual(await audit(),laterState);assert.equal(laterState.document_snapshots.find(r=>r.document_id===historyId).revision,3);assert.equal(JSON.stringify(laterDraft),laterBytes);
      await stopServer();await closeConnections();stopPg();startPg();owner=await connect('wonffice_owner');observer=await connect('schema_test_admin');await startServer(policyFile,'server-native-persisted',documentPolicyFile);assert.deepEqual(await audit(),laterState);
      for(const [receipt,text] of [[A,rawA2],[B,rawB],[C,rawC]])assert.equal((await send('GET',nbase+`/documents/${receipt.document.documentId}`,undefined,'writer-a')).body.snapshotText,text);
      assert.deepEqual((await send('GET',nbase+'/receipts/update/'+historyInput.idempotencyKey,undefined,'writer-a')).body,history);
    });
    await check('operator preserve and adopt independent of registration; current historical read and fixed write retry authority',async()=>{
      await stopServer();const restricted=join(evidence,'operator-document-preserve-only.json');writeFileSync(restricted,JSON.stringify([{...documentPolicy,adoptRoles:[]}]),{mode:0o600});await startServer(policyFile,'server-native-preserve-only',restricted);
      assert.equal((await send('GET',nbase+'/receipts/update/'+historyInput.idempotencyKey,undefined,'writer-a')).status,200);
      await assertDenied('adopt-role-removed',()=>send('PUT',nbase+`/documents/${historyId}/snapshot`,historyInput,'writer-a'),403,'scope_forbidden');
      const preserved=input(historyId,historyAfter+' ',historyAfter+'  ','http-preserve-only-confirm',3,'preserve');
      const preservedResponse=await send('PUT',nbase+`/documents/${historyId}/snapshot`,preserved,'writer-a');assert.equal(preservedResponse.status,200);assert.equal(preservedResponse.body.document.revision,4);assert.equal(preservedResponse.body.snapshotText,historyAfter+'  ');
      const exactVersion=sourceA.schemaBundle.selected[0];assert.equal((await send('GET',rbase+`/schemas/${exactVersion.schemaId}/versions/${exactVersion.version}`,undefined,'writer-a')).status,200);

      await stopServer();const denied=join(evidence,'operator-document-cap-removed.json');writeFileSync(denied,JSON.stringify([{...documentPolicy,capabilities:['note.field.text.v1']}]),{mode:0o600});await startServer(policyFile,'server-native-caps-removed',denied);
      await assertDenied('history-caps-removed',()=>send('GET',nbase+'/receipts/update/'+historyInput.idempotencyKey,undefined,'writer-a'),403,'scope_forbidden');
      await stopServer();await startServer(policyFile,'server-native-policy-restored',documentPolicyFile);assert.deepEqual((await send('GET',nbase+'/receipts/update/'+historyInput.idempotencyKey,undefined,'writer-a')).body,history);
    });
    await check('actual JWT-provider and database outages named HTTP failures recover without new effect',async()=>{
      const before=await audit();await stopServer();await new Promise(resolve=>jwks.close(resolve));jwks=undefined;await startServer(policyFile,'server-native-jwks-down',documentPolicyFile);
      const unavailable=await send('GET',nbase+`/documents/${A.document.documentId}`,undefined,'writer-a');assert.equal(unavailable.status,503);assert.equal(unavailable.body.status,'auth_unavailable');assert.deepEqual(await audit(),before);
      jwks=createServer((_request,response)=>{response.setHeader('content-type','application/json');response.end(JSON.stringify({keys:[publicJwk]}));});await new Promise((resolve,reject)=>{jwks.once('error',reject);jwks.listen(jwksPort,'127.0.0.1',resolve);});
      await stopServer();await startServer(policyFile,'server-native-jwks-restored',documentPolicyFile);assert.equal((await send('GET',nbase+`/documents/${A.document.documentId}`,undefined,'writer-a')).status,200);
      await closeConnections();stopPg();const unavailableDB=await send('GET',nbase+`/documents/${A.document.documentId}`,undefined,'writer-a');assert.equal(unavailableDB.status,503);assert.equal(unavailableDB.body.status,'schema_store_unavailable');startPg();owner=await connect('wonffice_owner');assert.deepEqual(await audit(),before);
      assert.equal((await send('GET',nbase+`/documents/${A.document.documentId}`,undefined,'writer-a')).body.snapshotText,rawA2);saveAudit('ABC-final',await audit());
    });
    report.native2={status:'passed',qualification:'Actual own compiled HTTP/privatePG/controlled signedJWKS; not genuine userlogin/NoteUI/MCP/retirement/backup/install'};
  }

  await check('actual DB-down readiness503 while process remains live',async()=>{
    await owner.end();clients.splice(clients.indexOf(owner),1);stopPg();
    assert.equal((await fetch(origin+'/health/live')).status,200);assert.equal((await fetch(origin+'/health/ready')).status,503);
  });
  await stopServer();
  const after=graph(stage);writeFileSync(join(evidence,'runtime-stage-after.json'),JSON.stringify(after,null,2));assert.deepEqual(after,stageBefore);
  const loaded=new Set();
  for(const log of logs){const text=readFileSync(log,'utf8');for(const match of text.matchAll(/file:\/\/\/[^\s'"),}]+|\/[^\s'"),}]+\.(?:js|cjs|mjs|json|node)/g)){
    let path;try{path=match[0].startsWith('file:')?fileURLToPath(match[0]):match[0];if(existsSync(path)&&statSync(path).isFile())loaded.add(realpathSync(path));}catch{/* The bounded startup poll or already-closed resource may refuse; final cleanup is tracked separately. */}
  }}
  assert.ok(loaded.has(realpathSync(join(stage,'dist/main.js'))),'Actual module trace must include staged main');
  for(const path of loaded){assert.ok(Object.hasOwn(stageBefore.files,path),`Loaded file outside bound runtime graph: ${path}`);assert.equal(/\.(?:ts|tsx)$/.test(path),false);}
  writeFileSync(join(evidence,'runtime-loaded.json'),JSON.stringify([...loaded].sort().map(path=>({path,sha256:stageBefore.files[path]})),null,2));
  report.runtime={boundFiles:Object.keys(stageBefore.files).length,loadedFiles:loaded.size,unchanged:true,noRepositoryTypeScript:true};report.status='passed';save();
} catch(error){report.status='failed';report.failure=String(error);save();throw error;}
finally{
  let clean=true;try{if(child)await stopServer();}catch{clean=false;}
  if(forwarder){forwarder.closeAllConnections();await new Promise(resolve=>forwarder.close(resolve));}
  if(jwks)await new Promise(resolve=>jwks.close(resolve));
  try{await closeConnections();}catch(error){clean=false;report.cleanupFailure=String(error);}
  if(pgStarted)try{stopPg();}catch(error){clean=false;report.cleanupFailure=String(error);}
  report.cleanup=clean;if(!clean)report.status='failed';lease.state=clean?'stopped-retained':'cleanup-failed';lease.cleanup=report.cleanupFailure??'own server/JWKS/pools/PG stopped; data retained';saveLease();if(privateRoot&&existsSync(join(privateRoot,'postgres.log')))cpSync(join(privateRoot,'postgres.log'),join(evidence,'postgres.log'));save();
}
if(!report.cleanup)throw new Error('Only-owned cleanup failed');

}
