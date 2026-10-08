// LangChain JS Community MIT 원본 이식: THIRD_PARTY_NOTICES.md 참조.
import { Document } from '@langchain/core/documents';
import type { BaseLanguageModelInput } from '@langchain/core/language_models/base';
import { BaseLanguageModel } from '@langchain/core/language_models/base';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import type { RunnableInterface } from '@langchain/core/runnables';
import { toJsonSchema } from '@langchain/core/utils/json_schema';
import { GraphDocument, Node, Relationship } from '@langchain/neo4j';
import { z } from 'zod/v3';

export const SYSTEM_PROMPT = `
# Knowledge Graph Instructions for GPT-4\n
## 1. Overview\n
You are a top-tier algorithm designed for extracting information in structured formats to build a knowledge graph.\n
Try to capture as much information from the text as possible without sacrifing accuracy. Do not add any information that is not explicitly mentioned in the text\n"
- **Nodes** represent entities and concepts.\n"
- The aim is to achieve simplicity and clarity in the knowledge graph, making it\n
accessible for a vast audience.\n
## 2. Labeling Nodes\n
- **Consistency**: Ensure you use available types for node labels.\n
Ensure you use basic or elementary types for node labels.\n
- For example, when you identify an entity representing a person, always label it as **'person'**. Avoid using more specific terms like 'mathematician' or 'scientist'
- **Node IDs**: Never utilize integers as node IDs. Node IDs should be names or human-readable identifiers found in the text.\n
- **Relationships** represent connections between entities or concepts.\n
Ensure consistency and generality in relationship types when constructing knowledge graphs. Instead of using specific and momentary types such as 'BECAME_PROFESSOR', use more general and timeless relationship types like 'PROFESSOR'. Make sure to use general and timeless relationship types!\n
## 3. Coreference Resolution\n
- **Maintain Entity Consistency**: When extracting entities, it's vital to ensure consistency.\n
If an entity, such as "John Doe", is mentioned multiple times in the text but is referred to by different names or pronouns (e.g., "Joe", "he"), always use the most complete identifier for that entity throughout the knowledge graph. In this example, use "John Doe" as the entity ID.\n
Remember, the knowledge graph should be coherent and easily understandable, so maintaining consistency in entity references is crucial.\n
## 4. Strict Compliance\n
Adhere to the rules strictly. Non-compliance will result in termination.
`;

const DEFAULT_PROMPT = /* #__PURE__ */ ChatPromptTemplate.fromMessages([
  ['system', SYSTEM_PROMPT],
  [
    'human',
    'Tip: Make sure to answer in the correct format and do not include any explanations. Use the given format to extract information from the following input: {input}',
  ],
]);

interface OptionalEnumFieldProps {
  enumValues?: string[];
  description: string;
  isRel?: boolean;
  fieldKwargs?: object;
}

interface SchemaProperty {
  key: string;
  value: string;
}

interface ExtractedNode {
  id: string;
  type?: string;
  properties?: SchemaProperty[];
}

interface ExtractedRelationship {
  sourceNodeId: string;
  sourceNodeType?: string;
  relationshipType?: string;
  targetNodeId: string;
  targetNodeType?: string;
  properties?: SchemaProperty[];
}

interface ExtractedGraph {
  nodes?: ExtractedNode[];
  relationships?: ExtractedRelationship[];
}

function toTitleCase(str: string): string {
  return str
    .split(' ')
    .map((w) => w[0].toUpperCase() + w.substring(1).toLowerCase())
    .join('');
}

function createOptionalEnumType({
  enumValues = undefined,
  description = '',
  isRel = false,
}: OptionalEnumFieldProps): z.ZodTypeAny {
  let schema;

  if (enumValues && enumValues.length) {
    schema = z
      .enum(enumValues as [string, ...string[]])
      .describe(
        `${description} Available options are: ${enumValues.join(', ')}.`,
      );
  } else {
    const nodeInfo =
      'Ensure you use basic or elementary types for node labels.\n' +
      'For example, when you identify an entity representing a person, ' +
      "always label it as **'Person'**. Avoid using more specific terms " +
      "like 'Mathematician' or 'Scientist'";
    const relInfo =
      'Instead of using specific and momentary types such as ' +
      "'BECAME_PROFESSOR', use more general and timeless relationship types like " +
      "'PROFESSOR'. However, do not sacrifice any accuracy for generality";

    const additionalInfo = isRel ? relInfo : nodeInfo;

    schema = z.string().describe(description + additionalInfo);
  }

  return schema;
}

function createNodeSchema(allowedNodes: string[], nodeProperties: string[]) {
  const nodeSchema = z.object({
    id: z.string(),
    type: createOptionalEnumType({
      enumValues: allowedNodes,
      description: 'The type or label of the node.',
    }),
  });

  return nodeProperties.length > 0
    ? nodeSchema.extend({
        properties: z
          .array(
            z.object({
              key: createOptionalEnumType({
                enumValues: nodeProperties,
                description: 'Property key.',
              }),
              value: z.string().describe('Extracted value.'),
            }),
          )
          .describe(`List of node properties`),
      })
    : nodeSchema;
}

function createRelationshipSchema(
  allowedNodes: string[],
  allowedRelationships: string[],
  relationshipProperties: string[],
) {
  const relationshipSchema = z.object({
    sourceNodeId: z.string(),
    sourceNodeType: createOptionalEnumType({
      enumValues: allowedNodes,
      description: 'The source node of the relationship.',
    }),
    relationshipType: createOptionalEnumType({
      enumValues: allowedRelationships,
      description: 'The type of the relationship.',
      isRel: true,
    }),
    targetNodeId: z.string(),
    targetNodeType: createOptionalEnumType({
      enumValues: allowedNodes,
      description: 'The target node of the relationship.',
    }),
  });

  return relationshipProperties.length > 0
    ? relationshipSchema.extend({
        properties: z
          .array(
            z.object({
              key: createOptionalEnumType({
                enumValues: relationshipProperties,
                description: 'Property key.',
              }),
              value: z.string().describe('Extracted value.'),
            }),
          )
          .describe(`List of relationship properties`),
      })
    : relationshipSchema;
}

function createSchema(
  allowedNodes: string[],
  allowedRelationships: string[],
  nodeProperties: string[],
  relationshipProperties: string[],
) {
  const nodeSchema = createNodeSchema(allowedNodes, nodeProperties);
  const relationshipSchema = createRelationshipSchema(
    allowedNodes,
    allowedRelationships,
    relationshipProperties,
  );

  const dynamicGraphSchema = z.object({
    nodes: z.array(nodeSchema).describe('List of nodes'),
    relationships: z
      .array(relationshipSchema)
      .describe('List of relationships.'),
  });

  return dynamicGraphSchema;
}

function convertPropertiesToRecord(
  properties: SchemaProperty[],
): Record<string, string> {
  return properties.reduce((accumulator: Record<string, string>, prop) => {
    accumulator[prop.key] = prop.value;
    return accumulator;
  }, {});
}

function mapToBaseNode(node: ExtractedNode): Node {
  return new Node({
    id: node.id,
    type: node.type ? toTitleCase(node.type) : '',
    properties: node.properties
      ? convertPropertiesToRecord(node.properties)
      : {},
  });
}

function mapToBaseRelationship({
  fallbackRelationshipType,
}: {
  fallbackRelationshipType: string | null;
}) {
  return function (relationship: ExtractedRelationship): Relationship {
    const relationshipType =
      relationship.relationshipType || fallbackRelationshipType;
    if (!relationshipType) {
      throw new Error('관계 타입을 추출하지 못했고 대체 타입도 없습니다.');
    }

    return new Relationship({
      source: new Node({
        id: relationship.sourceNodeId,
        type: relationship.sourceNodeType
          ? toTitleCase(relationship.sourceNodeType)
          : '',
      }),
      target: new Node({
        id: relationship.targetNodeId,
        type: relationship.targetNodeType
          ? toTitleCase(relationship.targetNodeType)
          : '',
      }),
      type: relationshipType.replace(' ', '_').toUpperCase(),
      properties: relationship.properties
        ? convertPropertiesToRecord(relationship.properties)
        : {},
    });
  };
}

export interface LLMGraphTransformerProps {
  llm: BaseLanguageModel;
  allowedNodes?: string[];
  allowedRelationships?: string[];
  prompt?: ChatPromptTemplate;
  strictMode?: boolean;
  nodeProperties?: string[];
  relationshipProperties?: string[];

  /** LLM이 관계 타입을 누락했을 경우 사용하는 기본 타입. */
  fallbackRelationshipType?: string | null;
  /** Structured Output 미지원 모델이 사용할 별도 추출 어댑터. */
  structuredOutputAdapter?: (
    schema: z.ZodTypeAny,
  ) => RunnableInterface<BaseLanguageModelInput, ExtractedGraph>;
}

export class LLMGraphTransformer {
  chain: RunnableInterface<{ input: string }, ExtractedGraph>;

  allowedNodes: string[] = [];

  allowedRelationships: string[] = [];

  strictMode: boolean;

  nodeProperties: string[];

  relationshipProperties: string[];

  fallbackRelationshipType: string | null = null;

  constructor({
    llm,
    allowedNodes = [],
    allowedRelationships = [],
    prompt = DEFAULT_PROMPT,
    strictMode = true,
    nodeProperties = [],
    relationshipProperties = [],
    fallbackRelationshipType = null,
    structuredOutputAdapter,
  }: LLMGraphTransformerProps) {
    if (
      !structuredOutputAdapter &&
      typeof llm.withStructuredOutput !== 'function'
    ) {
      throw new Error(
        "The specified LLM does not support the 'withStructuredOutput'. Please ensure you are using an LLM that supports this feature.",
      );
    }

    this.allowedNodes = allowedNodes;
    this.allowedRelationships = allowedRelationships;
    this.strictMode = strictMode;
    this.nodeProperties = nodeProperties;
    this.relationshipProperties = relationshipProperties;
    this.fallbackRelationshipType = fallbackRelationshipType;

    // 구조화 출력 스키마와 프롬프트를 연결한다.
    const schema = createSchema(
      allowedNodes,
      allowedRelationships,
      nodeProperties,
      relationshipProperties,
    );
    const structuredLLM = structuredOutputAdapter
      ? structuredOutputAdapter(schema)
      : llm.withStructuredOutput?.(toJsonSchema(schema));
    if (!structuredLLM) {
      throw new Error('구조화 출력 모델이나 Tool Calling 어댑터가 필요합니다.');
    }
    this.chain = prompt.pipe(structuredLLM);
  }

  /** 문서 하나를 LLM으로 처리하여 그래프 문서로 변환한다. */
  async processResponse(document: Document) {
    const text = document.pageContent;

    const rawSchema = await this.chain.invoke({ input: text });

    let nodes: Node[] = [];
    if (rawSchema?.nodes) {
      nodes = rawSchema.nodes.map(mapToBaseNode);
    }

    let relationships: Relationship[] = [];
    if (rawSchema?.relationships) {
      relationships = rawSchema.relationships.map(
        mapToBaseRelationship({
          fallbackRelationshipType: this.fallbackRelationshipType,
        }),
      );
    }

    if (
      this.strictMode &&
      (this.allowedNodes.length > 0 || this.allowedRelationships.length > 0)
    ) {
      if (this.allowedNodes.length > 0) {
        const allowedNodesLowerCase = this.allowedNodes.map((node) =>
          node.toLowerCase(),
        );

        // 노드 타입은 대소문자를 구분하지 않고 비교한다.
        nodes = nodes.filter((node) =>
          allowedNodesLowerCase.includes(node.type.toLowerCase()),
        );

        // 관계 양끝 노드 타입도 대소문자를 구분하지 않는다.
        relationships = relationships.filter(
          (rel) =>
            allowedNodesLowerCase.includes(rel.source.type.toLowerCase()) &&
            allowedNodesLowerCase.includes(rel.target.type.toLowerCase()),
        );
      }

      if (this.allowedRelationships.length > 0) {
        // 관계 타입도 대소문자를 구분하지 않는다.
        relationships = relationships.filter((rel) =>
          this.allowedRelationships
            .map((rel) => rel.toLowerCase())
            .includes(rel.type.toLowerCase()),
        );
      }
    }

    return new GraphDocument({
      nodes,
      relationships,
      source: document,
    });
  }

  /** 입력 문서들을 순서대로 처리하여 그래프 문서 배열로 변환한다. */
  async convertToGraphDocuments(
    documents: Document[],
  ): Promise<GraphDocument[]> {
    const results: GraphDocument[] = [];

    for (const document of documents) {
      const graphDocument = await this.processResponse(document);
      results.push(graphDocument);
    }

    return results;
  }
}
