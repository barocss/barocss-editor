import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, lstatSync, realpathSync, existsSync, cpSync, symlinkSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// Actual compiled-service/private PostgreSQL test with independent imported literals.
// Trusted principal fixtures are NOT genuine OIDC/login/API/UI or renderer evidence.
const SOURCE_A = {
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
};
const SOURCE_B = {
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
};
const TARGET_A2 = {
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
};
const COPY_A_ORACLE = {
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
};
const COPY_PATHS_A = [["document", "attributes", "pageId"], ["document", "content", 1, "content", 2, "attributes", "pageId"], ["document", "content", 4, "content", 1, "content", 0, "content", 1, "attributes", "pageId"]];
const COPY_PATHS_B = [["document", "attributes", "pageId"], ["document", "content", 0, "content", 2, "attributes", "pageId"], ["document", "content", 1, "content", 1, "content", 0, "content", 1, "attributes", "pageId"]];
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const digest = text => createHash('sha256').update(text, 'utf8').digest('hex');
const raw = file => JSON.stringify(file, null, 2) + '\n';
const tenant = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', workspace = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const foreignTenant = 'ffffffff-ffff-ffff-ffff-ffffffffffff', foreignWorkspace = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const issuer = 'https://native2-pg-fixture.invalid';
const principal = subject => ({ issuer, subject });
const policy = () => [{ tenantId: tenant, workspaceId: workspace, readRoles: ['editor', 'viewer'], preserveRoles: ['editor'], adoptRoles: ['editor'],
  capabilities: ['note.field.choice.v1', 'note.field.boolean.v1', 'note.field.number.v1', 'note.field.text.v1'] }];
function expectedCopy(literal, pageId, paths) {
  const copy = structuredClone(literal);
  for (const path of paths) {
    let node = copy;
    for (const name of path.slice(0, -1)) node = node[name];
    node[path.at(-1)] = pageId;
  }
  return raw({ format: copy.format, version: copy.version, schemaBundle: copy.schemaBundle, document: copy.document,
    ...(Object.hasOwn(copy, 'savedAt') ? { savedAt: copy.savedAt } : {}) });
}
const pinDigest = (id, bundle) => digest(JSON.stringify(['wonffice.note.snapshot-pins.cas.v1', tenant, workspace, id, 'pinned',
  bundle.selected.map(r => [r.schemaId, r.version, r.digest])]));
function updateInput(id, source, target, key, revision = 1, action = 'adopt') {
  return Object.freeze({ expectedRevision: revision, expectedSnapshotHash: digest(source), expectedPriorPinDigest: pinDigest(id, JSON.parse(source).schemaBundle),
    schemaAction: action, snapshotText: target, idempotencyKey: key });
}
function projection(target) {
  assert.equal(existsSync(target), false, 'Fresh stage only'); mkdirSync(target, { recursive: true, mode: 0o700 });
  const packages = new Map(), declared = [];
  function link(at, to) { mkdirSync(dirname(at), { recursive: true }); symlinkSync(relative(dirname(at), to), at, 'dir'); }
  function locate(name, from) {
    let current = from;
    for (;;) {
      const candidate = join(current, 'node_modules', name);
      if (existsSync(join(candidate, 'package.json'))) return copyExternal(realpathSync(candidate));
      const next = dirname(current); if (next === current) throw new Error(`locked_dependency_missing:${name}`); current = next;
    }
  }
  function copyExternal(source) {
    if (packages.has(source)) return packages.get(source);
    const manifest = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8'));
    const destination = join(target, '.packages', `${manifest.name.replaceAll('/', '_')}@${manifest.version}-${digest(source).slice(0, 8)}`);
    packages.set(source, destination); mkdirSync(destination, { recursive: true });
    for (const name of readdirSync(source)) if (name !== 'node_modules') cpSync(join(source, name), join(destination, name), { recursive: true, dereference: true });
    declared.push({ kind: 'locked-external-copy', source, sourceManifestSHA: digest(readFileSync(join(source, 'package.json'))), name: manifest.name, version: manifest.version });
    for (const name of Object.keys(manifest.dependencies ?? {})) link(join(destination, 'node_modules', name), locate(name, source));
    for (const name of Object.keys(manifest.peerDependencies ?? {})) {
      if (existsSync(join(destination, 'node_modules', name))) continue;
      try { link(join(destination, 'node_modules', name), locate(name, source)); }
      catch (error) { if (!manifest.peerDependenciesMeta?.[name]?.optional) throw error; }
    }
    return destination;
  }
  const own = new Map();
  for (const [path, name, exports, dependencies] of [
    ['apps/office-service', '@barocss/office-service', { './document-store': './dist/document-store.js', './schema-registry-store': './dist/schema-registry-store.js',
      './membership-store': './dist/membership-store.js', './migrate': './dist/migrate.js', './membership-admin': './dist/membership-admin.js', './migrations': './dist/migrations.js' }, { '@barocss/schema': 'workspace:^', '@barocss/office-note-file': 'workspace:^', pg: '8.23.0' }],
    ['packages/schema', '@barocss/schema', { './registry-contract': './dist/registry-contract.js' }, {}],
    ['packages/office-note-file', '@barocss/office-note-file', { '.': './dist/index.js' }, {}]
  ]) {
    const from = join(root, path), to = join(target, '.packages', name.replaceAll('/', '_')); own.set(name, to); mkdirSync(to, { recursive: true });
    cpSync(join(from, 'dist'), join(to, 'dist'), { recursive: true });
    const original = JSON.parse(readFileSync(join(from, 'package.json'), 'utf8'));
    writeFileSync(join(to, 'package.json'), JSON.stringify({ name, version: original.version, type: 'module', exports, dependencies }, null, 2));
    declared.push({ kind: 'test-only-compiled-subpath-projection', source: from, sourceManifestSHA: digest(readFileSync(join(from, 'package.json'))), name, exports, dependencies,
      qualification: 'Copied dist can contain unused modules; projected manifests are NOT full package deployment/install support.' });
  }
  for (const to of own.values()) {
    const m = JSON.parse(readFileSync(join(to, 'package.json'), 'utf8'));
    for (const dependency of Object.keys(m.dependencies)) link(join(to, 'node_modules', dependency), own.get(dependency) ?? locate(dependency, join(root, 'apps/office-service')));
  }
  mkdirSync(join(target, 'node_modules'), { recursive: true });
  for (const [name, to] of own) link(join(target, 'node_modules', name), to);
  link(join(target, 'node_modules/pg'), locate('pg', join(root, 'apps/office-service')));
  writeFileSync(join(target, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  cpSync(fileURLToPath(import.meta.url), join(target, 'harness.mjs'));
  return declared;
}
function graph(directory) {
  const files = {}, links = {};
  function walk(path) {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) { links[relative(directory, path)] = realpathSync(path); return; }
    if (stat.isDirectory()) { for (const name of readdirSync(path)) walk(join(path, name)); }
    else if (stat.isFile()) files[relative(directory, path)] = digest(readFileSync(path));
  }
  walk(directory); return { files, links };
}
async function modules() {
  const [{ default: pg }, docs, schemas, memberships, migrate, admin, codec] = await Promise.all([
    import('pg'), import('@barocss/office-service/document-store'), import('@barocss/office-service/schema-registry-store'),
    import('@barocss/office-service/membership-store'), import('@barocss/office-service/migrate'), import('@barocss/office-service/membership-admin'), import('@barocss/office-note-file')
  ]);
  return { pg, ...docs, ...schemas, ...memberships, ...migrate, ...admin, ...codec };
}
async function worker(mode, configFile) {
  assert.equal(process.version, 'v22.22.0');
  const config = JSON.parse(readFileSync(configFile, 'utf8'));
  assert.ok(config.socket.startsWith('/private/tmp/n2-pg-')); assert.equal(config.uid, process.getuid());
  const m = await modules(), pool = new m.pg.Pool({ host: config.socket, port: 15432, database: 'native2_test', user: 'wonffice_app', max: 1 });
  try {
    const store = new m.DocumentStore(pool, { noteSchemaPolicy: policy() });
    if (mode === 'commit-omit-response') { await store.updateSnapshot(principal('writer-a'), tenant, config.doc, config.attempt); return; }
    assert.equal(mode, 'reopen');
    const results = [];
    for (const item of config.expected) {
      const opened = await store.open(principal('writer-a'), tenant, item.doc);
      assert.equal(opened.snapshotText, item.raw); assert.equal(opened.document.snapshotHash, digest(item.raw));
      results.push({ doc: item.doc, rawHash: digest(item.raw), revision: opened.document.revision });
    }
    console.log(JSON.stringify({ worker: 'fresh-compiled-node-reopen', results }));
  } finally { await pool.end(); }
}
const mode = process.argv[2];
if (mode === '--staged-run') {
  await run();
} else if (mode === '--worker') {
  await worker(process.argv[3], process.argv[4]);
} else {
  assert.equal(process.version, 'v22.22.0');
  const evidence = process.env.NATIVE2_PG_EVIDENCE;
  if (!evidence) throw new Error('NATIVE2_PG_EVIDENCE required');
  assert.equal(existsSync(evidence), false, 'Fresh evidence destination'); mkdirSync(evidence, { recursive: true, mode: 0o700 });
  const stage = join(evidence, 'runtime-stage'), declaration = projection(stage), before = graph(stage);
  writeFileSync(join(evidence, 'stage-projection.json'), JSON.stringify(declaration, null, 2));
  writeFileSync(join(evidence, 'stage-before.json'), JSON.stringify(before, null, 2));
  const log = [];
  const child = spawn(process.execPath, [join(stage, 'harness.mjs'), '--staged-run'], { cwd: stage, env: { ...process.env, NODE_DEBUG: 'esm,module' }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', bytes => { process.stdout.write(bytes); log.push(bytes.toString()); });
  child.stderr.on('data', bytes => { process.stderr.write(bytes); log.push(bytes.toString()); });
  const exit = await new Promise((resolveExit, reject) => { child.once('error', reject); child.once('exit', (code, signal) => resolveExit({ code, signal })); });
  writeFileSync(join(evidence, 'staged-process.log'), log.join(''));
  const after = graph(stage); writeFileSync(join(evidence, 'stage-after.json'), JSON.stringify(after, null, 2)); assert.deepEqual(after, before);
  writeFileSync(join(evidence, 'staged-exit.json'), JSON.stringify(exit));
  const loaded = new Set();
  for (const match of log.join('').matchAll(/file:\/\/[^\s'"\])}]+/g)) {
    try { const p = fileURLToPath(match[0]); if (p.startsWith(stage + '/') && existsSync(p)) loaded.add(relative(stage, realpathSync(p))); } catch { /* Diagnostic URLs may contain framing; raw logs retained. */ }
  }
  assert.ok(loaded.has('.packages/@barocss_office-service/dist/document-store.js'), 'Actual compiled store must be observed in module trace');
  for (const p of loaded) { assert.ok(Object.hasOwn(before.files, p)); assert.equal(/\.(ts|tsx)$/.test(p), false); }
  writeFileSync(join(evidence, 'staged-loaded.json'), JSON.stringify([...loaded].sort().map(path => ({ path, sha256: before.files[path] })), null, 2));
  if (exit.code !== 0 || exit.signal) process.exitCode = 1;
}
async function run() {
  assert.equal(process.version, 'v22.22.0');
  const evidence = process.env.NATIVE2_PG_EVIDENCE, bin = process.env.PG_BIN;
  if (!evidence || !bin) throw new Error('Owned evidence and explicit PG_BIN required');
  const m = await modules();
  const privateRoot = mkdtempSync('/private/tmp/n2-pg-'), socket = join(privateRoot, 'socket'), data = join(privateRoot, 'data');
  mkdirSync(socket, { mode: 0o700 });
  const nonce = randomUUID(), leaseFile = join(evidence, 'runtime-lease.json');
  const report = { kind: 'actual-private-pg-direct-compiled-service', status: 'incomplete', groups: [], runId: nonce,
    notClaimed: ['genuine OIDC/login/API/UI/renderer', 'HTTP wire lost ACK', 'company/account retirement', 'MCP/Yorkie/full495/Goal13/alpha/release'] };
  const lease = { runId: nonce, uid: process.getuid(), controllerPid: process.pid, root: privateRoot, socket, data, port: 15432,
    bin: realpathSync(bin), state: 'prepared', pg: {}, qualification: 'Exclusive fresh private Unix cluster; no shared URL, TCP port, daemon or takeover.' };
  const binaryNames = ['initdb', 'pg_ctl', 'postgres', 'pg_config', 'pg_dump', 'pg_restore'];
  for (const name of binaryNames) lease.pg[name] = { path: realpathSync(join(bin, name)), sha256: digest(readFileSync(join(bin, name))),
    version: execFileSync(join(bin, name), ['--version'], { encoding: 'utf8' }).trim() };
  const save = () => { writeFileSync(leaseFile, JSON.stringify(lease, null, 2), { mode: 0o600 }); writeFileSync(join(evidence, 'pg-proof.json'), JSON.stringify(report, null, 2), { mode: 0o600 }); };
  save();
  const command = (name, args) => execFileSync(join(bin, name), args, { encoding: 'utf8', stdio: 'pipe' });
  let started = false, owner, observer;
  const clients = [], pools = [], notices = [], barriers = [];
  const cfg = (user, database = 'native2_test', application_name = 'native2-controller') => ({ host: socket, port: 15432, user, database, application_name });
  async function connect(user, database, label) { const c = new m.pg.Client(cfg(user, database, label)); await c.connect(); clients.push(c); return c; }
  function appPool(label) {
    const p = new m.pg.Pool({ ...cfg('wonffice_app', 'native2_test', label), max: 1, connectionTimeoutMillis: 1500 });
    p.on('connect', c => c.on('notice', n => notices.push({ label, severity: n.severity, code: n.code, message: n.message })));
    pools.push(p); return p;
  }
  const check = async (id, name, work) => { await work(); report.groups.push({ id, name, status: 'passed' }); save(); console.log(JSON.stringify({ pgGroup: id, name, result: 'passed' })); };
  function ownPID() {
    const lines = readFileSync(join(data, 'postmaster.pid'), 'utf8').trim().split('\n');
    assert.equal(realpathSync(lines[1]), realpathSync(data));
    const pid = Number(lines[0]); assert.ok(pid > 0); if (lease.postmasterPid) assert.equal(pid, lease.postmasterPid);
    return pid;
  }
  function start() {
    command('pg_ctl', ['-D', data, '-l', join(privateRoot, 'postgres.log'), '-o', `-k ${socket} -h '' -p 15432`, '-w', 'start']);
    started = true; lease.postmasterPid = undefined; lease.postmasterPid = ownPID(); lease.state = 'running'; save();
  }
  function stop() { ownPID(); command('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']); started = false; lease.state = 'stopped'; save(); }
  async function shutdownConnections() {
    await Promise.all(pools.splice(0).map(p => p.end()));
    await Promise.all(clients.splice(0).map(c => c.end()));
  }
  async function workerRun(label, configuration) {
    const file = join(evidence, label + '-worker-input.json'); writeFileSync(file, JSON.stringify({ socket, uid: process.getuid(), ...configuration }, null, 2), { mode: 0o600 });
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--worker', label === 'commit-omit-response' ? label : 'reopen', file],
      { cwd: dirname(fileURLToPath(import.meta.url)), env: { ...process.env, NODE_DEBUG: 'esm,module' }, stdio: ['ignore', 'pipe', 'pipe'] });
    const stdout = [], stderr = [];
    child.stdout.on('data', b => stdout.push(b.toString())); child.stderr.on('data', b => stderr.push(b.toString()));
    const exit = await new Promise((done, reject) => { child.once('error', reject); child.once('exit', (code, signal) => done({ code, signal })); });
    writeFileSync(join(evidence, label + '-worker.stdout'), stdout.join('')); writeFileSync(join(evidence, label + '-worker.stderr'), stderr.join(''));
    writeFileSync(join(evidence, label + '-worker-exit.json'), JSON.stringify({ pid: child.pid, ...exit })); assert.equal(exit.code, 0); assert.equal(exit.signal, null);
    return stdout.join('');
  }
  async function durableState(ids) {
    const rows = (await owner.query(`SELECT d.id,d.tenant_id,d.workspace_id,d.product,d.title,d.page_id,d.creator_user_id,d.metadata_revision,d.mode,d.document_key,
      d.updated_at AS document_updated_at,s.file_format,s.file_version,s.snapshot_text,s.snapshot_hash,s.revision,s.updated_at AS snapshot_updated_at
      FROM wonffice.documents d JOIN wonffice.document_snapshots s ON s.tenant_id=d.tenant_id AND s.document_id=d.id WHERE d.id=ANY($1::uuid[]) ORDER BY d.id`, [ids])).rows;
    const receipts = (await owner.query(`SELECT tenant_id,identity_id,operation,idempotency_key,request_hash,document_id,result_head,result_snapshot_text,created_at
      FROM wonffice.document_receipts WHERE document_id=ANY($1::uuid[]) OR idempotency_key LIKE 'pg-fail-%' ORDER BY tenant_id,identity_id,operation,idempotency_key`, [ids])).rows;
    return { rows, receipts };
  }
  async function countState() {
    return (await owner.query(`SELECT (SELECT count(*)::int FROM wonffice.documents) documents,(SELECT count(*)::int FROM wonffice.document_snapshots) snapshots,
      (SELECT count(*)::int FROM wonffice.document_receipts) receipts`)).rows[0];
  }
  async function barrier(pids, blocker, label) {
    const deadline = Date.now() + 2200;
    let last;
    while (Date.now() < deadline) {
      last = (await observer.query(`SELECT pid,application_name,wait_event_type,wait_event,pg_blocking_pids(pid) blockers,query
        FROM pg_stat_activity WHERE pid=ANY($1::int[]) ORDER BY pid`, [pids])).rows;
      const ownerChain = async (pid, visited = new Set()) => {
        if (pid === blocker) return [pid];
        if (visited.has(pid) || visited.size >= 8) return null;
        const seen = new Set(visited); seen.add(pid);
        const row = (await observer.query('SELECT pg_blocking_pids($1::int) blockers', [pid])).rows[0];
        for (const parent of row.blockers) { const chain = await ownerChain(parent, seen); if (chain) return [pid, ...chain]; }
        return null;
      };
      const expectedQuery = label.startsWith('membership-') ? /project_current_actor/ : /FOR UPDATE OF d,\s*s/;
      const intended = last.length === pids.length && new Set(pids).size === pids.length && last.every(row => row.wait_event_type === 'Lock' &&
        row.application_name.startsWith(label.startsWith('membership-') ? 'native2-held-' : 'native2-race-') && expectedQuery.test(row.query));
      if (intended) {
        const chains = await Promise.all(pids.map(pid => ownerChain(pid)));
        if (chains.every(chain => chain && chain.at(-1) === blocker)) {
          barriers.push({ label, blocker, pids, rows: last, chains }); writeFileSync(join(evidence, 'pg-barriers.json'), JSON.stringify(barriers, null, 2)); return;
        }
      }
      await new Promise(done => setTimeout(done, 15));
    }
    writeFileSync(join(evidence, label + '-barrier-not-reached.json'), JSON.stringify({ blocker, pids, last }, null, 2));
    throw new Error('actual_pg_barrier_NOT_REACHED:' + label);
  }
  const appStore = pool => new m.DocumentStore(pool, { noteSchemaPolicy: policy() });
  let pool, store, registry, actorA, actorB, originalA, originalB, rawA, rawB, rawA2, copiedC;
  try {
    command('initdb', ['-D', data, '-U', 'native2_test_admin', '--auth-local=trust', '--auth-host=reject', '--no-locale', '--encoding=UTF8']); start();
    const admin = await connect('native2_test_admin', 'postgres', 'native2-bootstrap');
    await admin.query(`CREATE ROLE wonffice_owner LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
      CREATE ROLE wonffice_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
      CREATE ROLE wonffice_backup LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT BYPASSRLS`);
    await admin.query('CREATE DATABASE native2_test OWNER wonffice_owner');
    owner = await connect('wonffice_owner', 'native2_test', 'native2-fixture-owner');
    observer = await connect('native2_test_admin', 'native2_test', 'native2-lock-observer');
    const applied = await m.migrate(owner); assert.deepEqual(applied, ['0001_tenant_workspaces','0002_oidc_memberships','0003_member_tenant_names','0004_document_snapshots',
      '0005_platform_operators','0006_company_member_admin','0007_document_collaboration_seed','0008_document_capabilities','0009_full_note_collaboration_seed',
      '0010_member_directory','0011_connected_projects','0012_project_execution_attempts','0013_criterion_confirmations','0014_criterion_verifications','0015_document_creator_attribution','0016_schema_registry']);
    await m.applyMembershipChange(owner, { action: 'bootstrap_owner', tenantId: tenant, tenantName: 'Native PG fixture', issuer, subject: 'operator', approvalRef: 'N2-PG-OPERATOR' });
    for (const [subject, role] of [['writer-a', 'editor'], ['writer-b', 'editor'], ['viewer', 'viewer']]) await m.applyMembershipChange(owner,
      { action: 'grant', tenantId: tenant, issuer, subject, role, approvalRef: 'N2-PG-' + subject });
    await m.applyMembershipChange(owner, { action: 'bootstrap_owner', tenantId: foreignTenant, tenantName: 'Foreign PG fixture', issuer, subject: 'foreign', approvalRef: 'N2-PG-FOREIGN' });
    await owner.query('INSERT INTO wonffice.workspaces(tenant_id,id,name) VALUES($1,$2,$3),($4,$5,$6)', [tenant, workspace, 'Native workspace', foreignTenant, foreignWorkspace, 'Foreign workspace']);
    const identities = (await owner.query('SELECT id,subject FROM wonffice.identities WHERE issuer=$1', [issuer])).rows;
    actorA = identities.find(x => x.subject === 'writer-a').id; actorB = identities.find(x => x.subject === 'writer-b').id;
    pool = appPool('native2-main'); store = appStore(pool);
    registry = new m.SchemaRegistryStore(pool, [{ tenantId: tenant, workspaceId: workspace, readRoles: ['editor', 'viewer'], registerRoles: ['editor'], capabilities: policy()[0].capabilities }]);
    await check('PG-N2-01', 'real private roles/RLS and independent native preconditions', async () => {
      const row = (await pool.query(`SELECT current_user,rolsuper,rolbypassrls,pg_has_role(current_user,'wonffice_owner','MEMBER') owner_member,
        current_setting('server_version') version FROM pg_roles WHERE rolname=current_user`)).rows[0];
      assert.equal(row.current_user, 'wonffice_app'); assert.equal(row.rolsuper, false); assert.equal(row.rolbypassrls, false); assert.equal(row.owner_member, false);
      await assert.rejects(pool.query('SET ROLE wonffice_owner'), e => e.code === '42501'); assert.equal((await pool.query('SELECT id FROM wonffice.documents')).rowCount, 0);
      for (const file of [SOURCE_A, SOURCE_B, TARGET_A2]) assert.ok(!('error' in m.readNoteSnapshotFile(raw(file))), 'independent full literal precondition');
      const before = await countState(); await assert.rejects(store.create(principal('writer-a'), tenant, { workspaceId: workspace, product: 'note', title: 'Missing registration',
        fileFormat: 'barocss-note', fileVersion: 2, snapshotText: raw(SOURCE_A), importMode: 'new-page-copy', idempotencyKey: 'pg-missing-registry' }), e => e instanceof m.DocumentError && e.reason === 'dependency_missing');
      assert.deepEqual(await countState(), before); writeFileSync(join(evidence, 'pg-role.json'), JSON.stringify({ row, identities, principalQualification: 'trusted fixtures, NOT genuine OIDC' }, null, 2));
    });
    await check('PG-N2-02', 'registered full closure and service-created A/B both definition1', async () => {
      for (const [id, version] of [['22222222-2222-2222-2222-222222222222', 1], ['22222222-2222-2222-2222-222222222222', 2], ['11111111-1111-1111-1111-111111111111', 1]]) {
        const entry = SOURCE_A.schemaBundle.definitions.find(e => e.reference.schemaId === id && e.reference.version === version);
        await registry.register(principal('writer-a'), tenant, workspace, id, version, { definitionText: entry.definitionText, idempotencyKey: `pg-register-${id}-${version}` });
      }
      const create = (who, file, title) => store.create(principal(who), tenant, { workspaceId: workspace, product: 'note', title, fileFormat: 'barocss-note', fileVersion: 2,
        snapshotText: raw(file), importMode: 'new-page-copy', idempotencyKey: 'pg-create-' + title });
      originalA = await create('writer-a', SOURCE_A, 'A'); originalB = await create('writer-b', SOURCE_B, 'B');
      rawA = expectedCopy(COPY_A_ORACLE, originalA.document.pageId, COPY_PATHS_A); rawB = expectedCopy(SOURCE_B, originalB.document.pageId, COPY_PATHS_B);
      assert.equal(originalA.snapshotText, rawA); assert.equal(originalB.snapshotText, rawB); assert.notEqual(originalA.document.documentId, originalB.document.documentId);
      assert.equal(originalA.document.creatorUserId, actorA); assert.equal(originalB.document.creatorUserId, actorB);
      const before = await durableState([originalA.document.documentId, originalB.document.documentId]);
      const definition2 = TARGET_A2.schemaBundle.definitions.find(e => e.reference.schemaId === '11111111-1111-1111-1111-111111111111' && e.reference.version === 2);
      await registry.register(principal('writer-a'), tenant, workspace, definition2.reference.schemaId, 2, { definitionText: definition2.definitionText, idempotencyKey: 'pg-register-main2' });
      assert.deepEqual(await durableState([originalA.document.documentId, originalB.document.documentId]), before);
      for (const receipt of [originalA, originalB]) assert.equal(JSON.parse(receipt.snapshotText).schemaBundle.selected[0].version, 1);
    });
    await check('PG-N2-03', 'only A definition2; full B unchanged and independent C copy', async () => {
      const beforeB = await durableState([originalB.document.documentId]); rawA2 = expectedCopy(TARGET_A2, originalA.document.pageId, COPY_PATHS_A);
      const saved = await store.updateSnapshot(principal('writer-a'), tenant, originalA.document.documentId,
        updateInput(originalA.document.documentId, rawA, rawA2, 'pg-only-A-adopts2'));
      assert.equal(saved.snapshotText, rawA2); assert.equal(saved.document.snapshotHash, digest(rawA2)); assert.equal(saved.document.revision, 2);
      assert.deepEqual(await durableState([originalB.document.documentId]), beforeB);
      copiedC = await store.create(principal('writer-a'), tenant, { workspaceId: workspace, product: 'note', title: 'C', fileFormat: 'barocss-note', fileVersion: 2,
        snapshotText: rawA2, importMode: 'new-page-copy', idempotencyKey: 'pg-copy-C2' });
      const expected = expectedCopy(TARGET_A2, copiedC.document.pageId, COPY_PATHS_A); assert.equal(copiedC.snapshotText, expected);
      for (const [docId, expectedText] of [[originalA.document.documentId, rawA2], [originalB.document.documentId, rawB], [copiedC.document.documentId, expected]]) {
        const opened = await store.open(principal('writer-a'), tenant, docId); assert.equal(opened.snapshotText, expectedText);
        const row = (await owner.query('SELECT snapshot_text,snapshot_hash,file_version FROM wonffice.document_snapshots WHERE document_id=$1', [docId])).rows[0];
        assert.deepEqual(row, { snapshot_text: expectedText, snapshot_hash: digest(expectedText), file_version: 2 });
      }
      await workerRun('initial-reopen', { expected: [{ doc: originalA.document.documentId, raw: rawA2 }, { doc: originalB.document.documentId, raw: rawB }, { doc: copiedC.document.documentId, raw: expected }] });
      writeFileSync(join(evidence, 'A-B-C-native.json'), JSON.stringify(await durableState([originalA.document.documentId, originalB.document.documentId, copiedC.document.documentId]), null, 2));
    });
    const newA = async label => {
      const receipt = await store.create(principal('writer-a'), tenant, { workspaceId: workspace, product: 'note', title: label, fileFormat: 'barocss-note', fileVersion: 2,
        snapshotText: raw(SOURCE_A), importMode: 'new-page-copy', idempotencyKey: 'pg-create-' + label });
      return { receipt, before: expectedCopy(COPY_A_ORACLE, receipt.document.pageId, COPY_PATHS_A), after: expectedCopy(TARGET_A2, receipt.document.pageId, COPY_PATHS_A) };
    };
    await check('PG-N2-04', 'real blocked competing CAS, exact same-key effect and stale predicates', async () => {
      const fresh = await newA('race'), id = fresh.receipt.document.documentId;
      const p1 = appPool('native2-race-1'), p2 = appPool('native2-race-2'), s1 = appStore(p1), s2 = appStore(p2);
      const pid1 = (await p1.query('SELECT pg_backend_pid() pid')).rows[0].pid, pid2 = (await p2.query('SELECT pg_backend_pid() pid')).rows[0].pid;
      assert.notEqual(pid1, pid2); await owner.query('BEGIN'); const blocker = (await owner.query('SELECT pg_backend_pid() pid')).rows[0].pid;
      await owner.query('SELECT d.id FROM wonffice.documents d JOIN wonffice.document_snapshots s ON s.tenant_id=d.tenant_id AND s.document_id=d.id WHERE d.id=$1 FOR UPDATE OF d,s', [id]);
      const requests = Promise.allSettled([s1.updateSnapshot(principal('writer-a'), tenant, id, updateInput(id, fresh.before, fresh.after, 'pg-race-a')),
        s2.updateSnapshot(principal('writer-b'), tenant, id, updateInput(id, fresh.before, fresh.after, 'pg-race-b'))]);
      try { await barrier([pid1, pid2], blocker, 'two-snapshot-waiters'); } finally { await owner.query('COMMIT'); }
      const results = await requests; assert.equal(results.filter(x => x.status === 'fulfilled').length, 1);
      assert.equal(results.filter(x => x.status === 'rejected' && x.reason instanceof m.DocumentError && x.reason.reason === 'revision_conflict').length, 1);
      assert.equal((await store.open(principal('writer-a'), tenant, id)).snapshotText, fresh.after);
      assert.equal((await owner.query("SELECT count(*)::int n FROM wonffice.document_receipts WHERE document_id=$1 AND operation='update'", [id])).rows[0].n, 1);
      const repeat = await newA('same-key'), repeatedInput = updateInput(repeat.receipt.document.documentId, repeat.before, repeat.after, 'pg-same-key');
      const same = await Promise.all([s1.updateSnapshot(principal('writer-a'), tenant, repeat.receipt.document.documentId, repeatedInput), s2.updateSnapshot(principal('writer-a'), tenant, repeat.receipt.document.documentId, repeatedInput)]);
      assert.deepEqual(same[0], same[1]); assert.equal(same[0].document.revision, 2);
      await assert.rejects(s1.updateSnapshot(principal('writer-a'), tenant, repeat.receipt.document.documentId, { ...repeatedInput, expectedSnapshotHash: '0'.repeat(64) }), e => e.reason === 'key_reuse');
      const wrong = await newA('wrong-cas'), before = await durableState([wrong.receipt.document.documentId]);
      for (const [change, reason] of [[{ expectedSnapshotHash: '0'.repeat(64) }, 'snapshot_hash_conflict'], [{ expectedPriorPinDigest: '0'.repeat(64) }, 'schema_pin_conflict']]) {
        await assert.rejects(store.updateSnapshot(principal('writer-a'), tenant, wrong.receipt.document.documentId, { ...updateInput(wrong.receipt.document.documentId, wrong.before, wrong.after, 'pg-wrong-' + reason), ...change }), e => e.reason === reason);
        assert.deepEqual(await durableState([wrong.receipt.document.documentId]), before);
      }
    });
    await check('PG-N2-05', 'real staged-target receipt NOTICE then P0001 restores whole original', async () => {
      const fresh = await newA('rollback'), id = fresh.receipt.document.documentId, before = await durableState([id]), expectedHash = digest(fresh.after);
      await owner.query(`CREATE FUNCTION wonffice.native2_test_receipt_failure() RETURNS trigger LANGUAGE plpgsql AS $fn$
        DECLARE actual record; BEGIN
          IF NEW.idempotency_key='pg-fail-after-snapshot' AND NEW.document_id='${id}'::uuid THEN
            SELECT snapshot_hash,revision,file_version,snapshot_text INTO actual FROM wonffice.document_snapshots WHERE document_id=NEW.document_id;
            IF actual.snapshot_hash<>'${expectedHash}' OR actual.revision<>2 OR actual.file_version<>2 OR actual.snapshot_text::jsonb#>>'{schemaBundle,selected,0,version}'<>'2'
              THEN RAISE EXCEPTION 'test_failpoint_target_NOT_REACHED'; END IF;
            RAISE NOTICE 'native2_test_receipt_failure_target_seen'; RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='native2_test_receipt_failure';
          END IF; RETURN NEW; END $fn$;
        CREATE TRIGGER native2_test_receipt_failure BEFORE UPDATE ON wonffice.document_receipts FOR EACH ROW EXECUTE FUNCTION wonffice.native2_test_receipt_failure()`);
      await assert.rejects(store.updateSnapshot(principal('writer-a'), tenant, id, updateInput(id, fresh.before, fresh.after, 'pg-fail-after-snapshot')),
        e => e.code === 'P0001' && e.message === 'native2_test_receipt_failure');
      assert.ok(notices.some(n => n.message === 'native2_test_receipt_failure_target_seen')); assert.deepEqual(await durableState([id]), before);
      assert.equal((await owner.query("SELECT count(*)::int n FROM wonffice.document_receipts WHERE idempotency_key='pg-fail-after-snapshot'")).rows[0].n, 0);
      await owner.query('DROP TRIGGER native2_test_receipt_failure ON wonffice.document_receipts; DROP FUNCTION wonffice.native2_test_receipt_failure()');
      await store.updateSnapshot(principal('writer-a'), tenant, id, updateInput(id, fresh.before, fresh.after, 'pg-after-failure-explicit'));
      writeFileSync(join(evidence, 'pg-notices.json'), JSON.stringify(notices, null, 2));
    });
    let history, historyInput, historyDoc, historyRaw;
    await check('PG-N2-06', 'fixed omitted direct response, historical replay/later draft and PG restart', async () => {
      const fresh = await newA('lost-response'); historyDoc = fresh.receipt.document.documentId; historyInput = updateInput(historyDoc, fresh.before, fresh.after, 'pg-omit-response');
      const frozenInput = JSON.stringify(historyInput), laterDraft = Object.freeze({ raw: fresh.after + ' ', key: 'pg-unsent-later-draft' }), frozenDraft = JSON.stringify(laterDraft);
      await workerRun('commit-omit-response', { doc: historyDoc, attempt: historyInput });
      assert.equal((await owner.query("SELECT count(*)::int n FROM wonffice.document_receipts WHERE document_id=$1 AND operation='update'", [historyDoc])).rows[0].n, 1);
      history = await store.getReceipt(principal('writer-a'), tenant, 'update', historyInput.idempotencyKey); const state = await durableState([historyDoc]);
      assert.deepEqual(await store.updateSnapshot(principal('writer-a'), tenant, historyDoc, historyInput), history); assert.deepEqual(await durableState([historyDoc]), state);
      assert.equal(JSON.stringify(historyInput), frozenInput); assert.equal(JSON.stringify(laterDraft), frozenDraft);
      await store.updateSnapshot(principal('writer-a'), tenant, historyDoc, updateInput(historyDoc, fresh.after, fresh.after + ' ', 'pg-explicit-later', 2, 'preserve'));
      const later = await durableState([historyDoc]); assert.deepEqual(await store.updateSnapshot(principal('writer-a'), tenant, historyDoc, historyInput), history); assert.deepEqual(await durableState([historyDoc]), later);
      assert.equal(history.document.revision, 2); assert.equal(later.rows[0].revision, 3); assert.equal(JSON.stringify(laterDraft), frozenDraft); historyRaw = fresh.after + ' ';
      const durableBefore = await durableState([originalA.document.documentId, originalB.document.documentId, historyDoc]);
      await shutdownConnections(); stop();
      const downPool = new m.pg.Pool({ ...cfg('wonffice_app'), max: 1, connectionTimeoutMillis: 800 });
      try { await assert.rejects(appStore(downPool).open(principal('writer-a'), tenant, historyDoc), e => e.code === 'ENOENT' || e.code === 'ECONNREFUSED'); } finally { await downPool.end(); }
      start(); owner = await connect('wonffice_owner', 'native2_test', 'native2-owner-restarted'); observer = await connect('native2_test_admin', 'native2_test', 'native2-observer-restarted');
      pool = appPool('native2-main-restarted'); store = appStore(pool); assert.deepEqual(await durableState([originalA.document.documentId, originalB.document.documentId, historyDoc]), durableBefore);
      assert.deepEqual(await store.getReceipt(principal('writer-a'), tenant, 'update', historyInput.idempotencyKey), history);
      await workerRun('after-db-restart', { expected: [{ doc: originalA.document.documentId, raw: rawA2 }, { doc: originalB.document.documentId, raw: rawB }, { doc: historyDoc, raw: historyRaw }] });
    });
    await check('PG-N2-07', 'real held active membership role/epoch, viewer/foreign/capability boundaries', async () => {
      for (const mutation of ['viewer', 'revoked']) {
        const fresh = await newA('held-' + mutation), id = fresh.receipt.document.documentId, before = await durableState([id]);
        const heldPool = appPool('native2-held-' + mutation), heldStore = appStore(heldPool), pid = (await heldPool.query('SELECT pg_backend_pid() pid')).rows[0].pid;
        await owner.query('BEGIN'); const blocker = (await owner.query('SELECT pg_backend_pid() pid')).rows[0].pid;
        await owner.query('SELECT identity_id FROM wonffice.tenant_memberships WHERE tenant_id=$1 AND identity_id=$2 FOR UPDATE', [tenant, actorA]);
        const pending = heldStore.updateSnapshot(principal('writer-a'), tenant, id, updateInput(id, fresh.before, fresh.after, 'pg-held-' + mutation));
        const outcome = pending.then(value => ({ value }), error => ({ error }));
        try {
          await barrier([pid], blocker, 'membership-before-current-' + mutation);
          await owner.query(mutation === 'viewer' ? "UPDATE wonffice.tenant_memberships SET role='viewer' WHERE tenant_id=$1 AND identity_id=$2" : 'UPDATE wonffice.tenant_memberships SET revoked_at=now() WHERE tenant_id=$1 AND identity_id=$2', [tenant, actorA]);
        } finally { await owner.query('COMMIT'); }
        const result = await outcome; assert.ok(result.error);
        if (mutation === 'viewer') assert.ok(result.error instanceof m.DocumentError && result.error.reason === 'forbidden'); else assert.ok(result.error instanceof m.TenantAccessDeniedError);
        assert.deepEqual(await durableState([id]), before);
        await m.applyMembershipChange(owner, { action: 'grant', tenantId: tenant, issuer, subject: 'writer-a', role: 'editor', approvalRef: 'N2-PG-restore-' + mutation });
        const restored = await store.updateSnapshot(principal('writer-a'), tenant, id, updateInput(id, fresh.before, fresh.after, 'pg-restored-' + mutation)); assert.equal(restored.snapshotText, fresh.after);
      }
      await assert.rejects(store.open(principal('foreign'), tenant, originalA.document.documentId), m.TenantAccessDeniedError);
      assert.equal((await store.open(principal('viewer'), tenant, originalB.document.documentId)).snapshotText, rawB);
      await assert.rejects(store.updateSnapshot(principal('viewer'), tenant, originalA.document.documentId, updateInput(originalA.document.documentId, rawA2, rawA2, 'pg-viewer-write', 2, 'preserve')), e => e.reason === 'forbidden');
      const deniedPolicy = policy(); deniedPolicy[0].capabilities = ['note.field.text.v1']; const restricted = new m.DocumentStore(pool, { noteSchemaPolicy: deniedPolicy });
      await assert.rejects(restricted.getReceipt(principal('writer-a'), tenant, 'update', historyInput.idempotencyKey), e => e.reason === 'scope_forbidden');
      assert.deepEqual(await store.getReceipt(principal('writer-a'), tenant, 'update', historyInput.idempotencyKey), history);
    });
    await check('PG-N2-08', 'unsupported/corrupted/default-closed boundaries retain exact originals', async () => {
      const before = await durableState([originalA.document.documentId, originalB.document.documentId]);
      await assert.rejects(new m.DocumentStore(pool).open(principal('writer-a'), tenant, originalA.document.documentId), e => e.reason === 'scope_forbidden');
      await assert.rejects(store.list(principal('writer-a'), tenant), e => e.reason === 'unsupported_native_format');
      await assert.rejects(store.updateMetadata(principal('writer-a'), tenant, originalA.document.documentId, { expectedMetadataRevision: 1, title: 'No mutation', idempotencyKey: 'pg-metadata2-denied' }), e => e.reason === 'unsupported_native_format');
      assert.ok('error' in m.readNoteV1SnapshotFile(rawA2)); const invalid = structuredClone(TARGET_A2); invalid.document.content[0].content[0].marks = [{ stype: 'untrusted-executable-mark' }];
      await assert.rejects(store.create(principal('writer-a'), tenant, { workspaceId: workspace, product: 'note', title: 'Unknown', fileFormat: 'barocss-note', fileVersion: 2,
        snapshotText: raw(invalid), importMode: 'new-page-copy', idempotencyKey: 'pg-unsupported' }), e => e.reason === 'invalid_snapshot');
      assert.deepEqual(await durableState([originalA.document.documentId, originalB.document.documentId]), before);
      const corrupt = await newA('corrupt-stored'), id = corrupt.receipt.document.documentId;
      await owner.query('UPDATE wonffice.document_snapshots SET snapshot_text=snapshot_text||$2 WHERE document_id=$1', [id, ' ']);
      const damaged = await durableState([id]); await assert.rejects(store.updateSnapshot(principal('writer-a'), tenant, id, updateInput(id, corrupt.before, corrupt.after, 'pg-corrupt-rejected')), e => e.reason === 'snapshot_store_unavailable');
      assert.deepEqual(await durableState([id]), damaged); await owner.query('UPDATE wonffice.document_snapshots SET snapshot_text=$2 WHERE document_id=$1', [id, corrupt.before]);
      const schemaGrants = (await pool.query("SELECT has_table_privilege(current_user,'wonffice.schema_versions','UPDATE') u,has_table_privilege(current_user,'wonffice.schema_versions','DELETE') d")).rows[0]; assert.deepEqual(schemaGrants, { u: false, d: false });
      writeFileSync(join(evidence, 'final-native-and-receipts.json'), JSON.stringify(await durableState([originalA.document.documentId, originalB.document.documentId, copiedC.document.documentId, historyDoc]), null, 2));
    });
    report.status = 'passed'; save();
  } catch (error) {
    report.failure = { name: error.name, message: error.message, code: error.code, stack: error.stack }; report.status = 'failed'; save(); throw error;
  } finally {
    try { await shutdownConnections(); if (started) stop(); lease.state = 'stopped-retained'; lease.cleanup = 'All own pools/clients closed; exact owned postmaster pg_ctl stop -w completed. Stopped cluster retained for evidence/reconciliation; no shared data touched.'; }
    catch (error) { lease.cleanupFailure = { message: error.message }; report.status = 'cleanup-failed'; process.exitCode = 1; save(); }
    finally { if (existsSync(join(privateRoot, 'postgres.log'))) cpSync(join(privateRoot, 'postgres.log'), join(evidence, 'postgres.log')); save(); }
  }
}
