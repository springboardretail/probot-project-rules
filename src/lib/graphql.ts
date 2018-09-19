export const getIssueProjectCardsQuery = `
  query($owner: String!, $repo: String!, $number: Int!) {
    repository(owner: $owner, name: $repo) {
      issue(number: $number) {
        projectCards(first: 100) {
          nodes {
            id
            project {
              id
              number
              name
            }
            column{
              id
              name
            }
          }
        }
      }
    }
  }
`;

export const getProjectByNameQuery = `
  query ($owner: String!, $repo: String!, $projectName: String!) {
    repository(owner: $owner, name: $repo) {
      projects(search: $projectName, first: 100) {
        nodes {
          id
          name
          columns(first: 100) {
            nodes {
              id
              name
            }
          }
        }
      }
    }
  }
`;

export const moveProjectCardMutation = `
  mutation MoveProjectCard($card: MoveProjectCardInput!) {
    moveProjectCard(input: $card) {
      cardEdge {
        node {
          id
        }
      }
      clientMutationId
    }
  }
`;

export const addProjectCardMutation = `
  mutation AddProjectCard($card: AddProjectCardInput!) {
    addProjectCard(input: $card) {
      cardEdge {
        node {
          id
        }
      }
      projectColumn {
        id
      }
      clientMutationId
    }
  }
`;
