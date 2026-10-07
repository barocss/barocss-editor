// Independently authored native2 diagnostic literals; not product activation.
export const NATIVE_NOTE_FIXTURES = {
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
export const NATIVE_NOTE_EXPECTED_VARIANTS = {
  "text": {
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
              "text": "목표 A • 독립 편집"
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
  "nested": {
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
                      "text": "항목 본문 A / 마지막 중첩 입력",
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
  "structure": {
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
          "content": [
            {
              "stype": "inline-text",
              "text": "새 구조 문단",
              "marks": []
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
  "sparse": {
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
        "authoredTag": "preserve-A",
        "opaqueSparse": null
      },
      "metadata": null,
      "content": [
        {
          "stype": "heading",
          "attributes": {
            "level": 2,
            "unknownNative": {
              "keep": null,
              "label": "Café"
            }
          },
          "content": [
            {
              "stype": "inline-text",
              "text": "목표 A"
            }
          ],
          "metadata": null
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
  "typing": {
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
              "text": "목표 A • 독립 편집",
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
  }
};
