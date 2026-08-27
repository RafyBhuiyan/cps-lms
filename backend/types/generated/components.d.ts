import type { Schema, Struct } from '@strapi/strapi';

export interface QuizDataQuestion extends Struct.ComponentSchema {
  collectionName: 'components_quiz_data_questions';
  info: {
    displayName: 'Question';
  };
  attributes: {
    correctOptionIndex: Schema.Attribute.Integer;
    options: Schema.Attribute.JSON;
    questionText: Schema.Attribute.Text;
  };
}

declare module '@strapi/strapi' {
  export namespace Public {
    export interface ComponentSchemas {
      'quiz-data.question': QuizDataQuestion;
    }
  }
}
